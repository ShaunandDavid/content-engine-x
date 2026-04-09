"""Semantic memory retrieval helpers for the Enoch pipeline.

Retrieval is intentionally lightweight: same-project episodic insights first,
cross-project semantic patterns second, then a wider recollection pass when the
first candidates look weak.
"""

from __future__ import annotations

import hashlib
import logging
import os
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

TOP_K_SEMANTIC = 5
TOP_K_EPISODIC = 3
MIN_CONFIDENCE_THRESHOLD = 0.60
FAMILIARITY_HIGH_THRESHOLD = 0.80
RECOLLECTION_LOW_THRESHOLD = 0.50


@dataclass
class BrainInsight:
    id: str
    category: str
    insight: str
    confidence_score: float
    reinforcement_count: int
    source: str
    source_stage: str | None
    source_project_id: str | None
    metadata: dict[str, Any]
    memory_tier: str | None = None
    relevance_score: float = 0.0


@dataclass
class RetrievalResult:
    insights: list[BrainInsight]
    retrieval_path: str
    query_hash: str
    total_candidates: int
    context_summary: str


def _supabase_headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _hash_query(query: str) -> str:
    return hashlib.sha256(query.encode("utf-8")).hexdigest()[:16]


def _build_context_summary(insights: list[BrainInsight]) -> str:
    if not insights:
        return ""

    lines = ["[ENOCH MEMORY - relevant past performance]"]
    for insight in insights:
        confidence = f"{insight.confidence_score:.0%}"
        reinforced = f" (confirmed {insight.reinforcement_count}x)" if insight.reinforcement_count > 1 else ""
        lines.append(
            f"- [{insight.category}] {insight.insight}{reinforced} [confidence: {confidence}]"
        )
    lines.append("[Apply these learnings to improve the current generation.]")
    return "\n".join(lines)


def _fetch_insights_from_supabase(
    *,
    category: str | None = None,
    project_id: str | None = None,
    limit: int = 10,
    min_confidence: float = MIN_CONFIDENCE_THRESHOLD,
) -> list[dict[str, Any]]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        logger.debug("brain_retriever: supabase is not configured, skipping retrieval")
        return []

    params: list[tuple[str, str]] = [
        ("select", "*"),
        ("is_active", "eq.true"),
        ("confidence", f"gte.{min_confidence}"),
        ("order", "reinforcement_count.desc,confidence.desc"),
        ("limit", str(limit)),
    ]
    if category:
        params.append(("category", f"eq.{category}"))
    if project_id:
        params.append(("source_project_id", f"eq.{project_id}"))

    try:
        response = httpx.get(
            f"{SUPABASE_URL}/rest/v1/enoch_brain_insights",
            headers=_supabase_headers(),
            params=params,
            timeout=5.0,
        )
        response.raise_for_status()
        return response.json()
    except Exception as exc:  # pragma: no cover - network/config dependent
        logger.warning("brain_retriever: supabase fetch failed: %s", exc)
        return []


def _extract_keywords(text: str) -> list[str]:
    stopwords = {
        "a",
        "an",
        "the",
        "and",
        "or",
        "for",
        "to",
        "in",
        "of",
        "with",
        "this",
        "that",
        "is",
        "are",
        "was",
        "be",
        "on",
        "at",
        "by",
    }
    words = (
        text.lower()
        .replace(",", " ")
        .replace(".", " ")
        .replace(":", " ")
        .replace("/", " ")
        .split()
    )
    return [word for word in words if word not in stopwords and len(word) > 3]


def _keyword_score(insight_text: str, query_keywords: list[str]) -> float:
    if not query_keywords:
        return 0.0
    lower_text = insight_text.lower()
    matches = sum(1 for keyword in query_keywords if keyword in lower_text)
    return matches / len(query_keywords)


def _score_and_rank(raw_insights: list[dict[str, Any]], query_keywords: list[str]) -> list[BrainInsight]:
    scored: list[BrainInsight] = []
    for row in raw_insights:
        confidence = float(row.get("confidence", row.get("confidence_score", 0.5)))
        reinforcement_count = int(row.get("reinforcement_count", 1))
        keyword_score = _keyword_score(str(row.get("insight", "")), query_keywords)
        relevance_score = (
            keyword_score * 0.50
            + confidence * 0.30
            + (min(reinforcement_count, 10) / 10) * 0.20
        )

        scored.append(
            BrainInsight(
                id=str(row.get("id", "")),
                category=str(row.get("category", "general")),
                insight=str(row.get("insight", "")),
                confidence_score=confidence,
                reinforcement_count=reinforcement_count,
                source=str(row.get("source", "self_reflection")),
                source_stage=(
                    str(row["source_stage"])
                    if row.get("source_stage") is not None
                    else None
                ),
                source_project_id=(
                    str(row["source_project_id"])
                    if row.get("source_project_id") is not None
                    else None
                ),
                metadata=row.get("metadata", {}) if isinstance(row.get("metadata"), dict) else {},
                memory_tier=(
                    str(row["memory_tier"])
                    if row.get("memory_tier") is not None
                    else None
                ),
                relevance_score=relevance_score,
            )
        )

    return sorted(scored, key=lambda insight: insight.relevance_score, reverse=True)


def _dedupe_by_id(insights: list[BrainInsight]) -> list[BrainInsight]:
    deduped: list[BrainInsight] = []
    seen_ids: set[str] = set()
    for insight in insights:
        if insight.id in seen_ids:
            continue
        seen_ids.add(insight.id)
        deduped.append(insight)
    return deduped


def _mark_insights_accessed(insights: list[BrainInsight]) -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return

    for insight in insights:
        if not insight.id:
            continue
        try:
            httpx.post(
                f"{SUPABASE_URL}/rest/v1/rpc/increment_insight_access",
                headers=_supabase_headers(),
                json={"insight_id": insight.id},
                timeout=4.0,
            ).raise_for_status()
        except Exception as exc:  # pragma: no cover - network/config dependent
            logger.debug("brain_retriever: access tracking failed for %s: %s", insight.id, exc)


def _finalize_result(
    *,
    selected: list[BrainInsight],
    retrieval_path: str,
    query_hash: str,
    total_candidates: int,
) -> RetrievalResult:
    _mark_insights_accessed(selected)
    return RetrievalResult(
        insights=selected,
        retrieval_path=retrieval_path,
        query_hash=query_hash,
        total_candidates=total_candidates,
        context_summary=_build_context_summary(selected),
    )


def retrieve_for_concept_generation(
    brief: dict[str, Any],
    project_config: dict[str, Any],
    project_id: str | None = None,
) -> RetrievalResult:
    query_text = (
        f"{brief.get('title', '')} "
        f"{brief.get('objective', '')} "
        f"{brief.get('audience', '')} "
        f"{project_config.get('tone', '')}"
    )
    keywords = _extract_keywords(query_text)
    query_hash = _hash_query(query_text)

    episodic_raw = _fetch_insights_from_supabase(project_id=project_id, limit=TOP_K_EPISODIC)
    episodic = _score_and_rank(episodic_raw, keywords)

    semantic_raw = _fetch_insights_from_supabase(category="content_preference", limit=TOP_K_SEMANTIC)
    semantic_raw.extend(_fetch_insights_from_supabase(category="approval_pattern", limit=TOP_K_SEMANTIC))
    semantic = _score_and_rank(semantic_raw, keywords)

    all_candidates = _dedupe_by_id([*episodic, *semantic])
    if not all_candidates:
        return RetrievalResult(
            insights=[],
            retrieval_path="empty",
            query_hash=query_hash,
            total_candidates=0,
            context_summary="",
        )

    top_score = all_candidates[0].relevance_score
    if top_score >= FAMILIARITY_HIGH_THRESHOLD:
        selected = all_candidates[:TOP_K_SEMANTIC]
        path = "familiarity"
    elif top_score < RECOLLECTION_LOW_THRESHOLD:
        wide_raw = _fetch_insights_from_supabase(limit=20, min_confidence=0.40)
        wide = _score_and_rank(wide_raw, keywords)
        selected = _dedupe_by_id(wide)[:TOP_K_SEMANTIC]
        path = "recollection"
    else:
        selected = all_candidates[:TOP_K_SEMANTIC]
        path = "episodic"

    return _finalize_result(
        selected=selected,
        retrieval_path=path,
        query_hash=query_hash,
        total_candidates=len(all_candidates),
    )


def retrieve_for_scene_planning(
    concept: dict[str, Any],
    project_config: dict[str, Any],
    project_id: str | None = None,
) -> RetrievalResult:
    query_text = (
        f"{concept.get('hook', '')} "
        f"{concept.get('thesis', '')} "
        f"{concept.get('visual_direction', '')} "
        f"{project_config.get('tone', '')}"
    )
    keywords = _extract_keywords(query_text)
    query_hash = _hash_query(query_text)

    raw: list[dict[str, Any]] = []
    for category in ("tone_preference", "rejection_pattern", "platform_performance", "audience_insight"):
        raw.extend(_fetch_insights_from_supabase(category=category, limit=4))

    if project_id:
        raw.extend(_fetch_insights_from_supabase(project_id=project_id, limit=3))

    ranked = _dedupe_by_id(_score_and_rank(raw, keywords))
    selected = ranked[:TOP_K_SEMANTIC]
    path = "familiarity" if selected and selected[0].relevance_score >= FAMILIARITY_HIGH_THRESHOLD else "episodic"

    return _finalize_result(
        selected=selected,
        retrieval_path=path if selected else "empty",
        query_hash=query_hash,
        total_candidates=len(ranked),
    )


def retrieve_for_prompt_creation(
    scene: dict[str, Any],
    concept: dict[str, Any],
    project_id: str | None = None,
) -> RetrievalResult:
    query_text = (
        f"{scene.get('title', '')} "
        f"{scene.get('visual_beat', '')} "
        f"{scene.get('narration', '')} "
        f"{scene.get('aspect_ratio', '9:16')} "
        f"{concept.get('visual_direction', '')}"
    )
    keywords = _extract_keywords(query_text)
    query_hash = _hash_query(query_text)

    raw: list[dict[str, Any]] = []
    for category in ("prompt_quality", "model_performance"):
        raw.extend(_fetch_insights_from_supabase(category=category, limit=5))

    if project_id:
        raw.extend(_fetch_insights_from_supabase(project_id=project_id, limit=2))

    ranked = _dedupe_by_id(_score_and_rank(raw, keywords))
    selected = ranked[:3]

    return _finalize_result(
        selected=selected,
        retrieval_path="familiarity" if selected else "empty",
        query_hash=query_hash,
        total_candidates=len(ranked),
    )
