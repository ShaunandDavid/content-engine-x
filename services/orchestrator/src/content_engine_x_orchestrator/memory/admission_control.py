"""Memory admission control for enoch_brain_insights.

Implements an A-MAC-style gate so low-value or redundant insights do not
pollute the long-term memory store.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

ADMIT_THRESHOLD = 0.55
NOVELTY_MIN = 0.30
SIMILARITY_REJECT_THRESHOLD = 0.85


@dataclass
class AdmissionScore:
    future_utility: float
    confidence: float
    novelty: float
    relevance: float
    recency_weight: float

    @property
    def composite(self) -> float:
        return (
            self.future_utility * 0.30
            + self.confidence * 0.20
            + self.novelty * 0.25
            + self.relevance * 0.15
            + self.recency_weight * 0.10
        )

    @property
    def admitted(self) -> bool:
        if self.novelty < NOVELTY_MIN:
            return False
        return self.composite >= ADMIT_THRESHOLD

    def to_dict(self) -> dict[str, float]:
        return {
            "future_utility": round(self.future_utility, 3),
            "confidence": round(self.confidence, 3),
            "novelty": round(self.novelty, 3),
            "relevance": round(self.relevance, 3),
            "recency_weight": round(self.recency_weight, 3),
            "composite": round(self.composite, 3),
        }


_DOMAIN_RELEVANT_CATEGORIES = {
    "content_preference",
    "approval_pattern",
    "rejection_pattern",
    "tone_preference",
    "audience_insight",
    "prompt_quality",
    "model_performance",
    "platform_performance",
    "brand_voice",
    "workflow_optimization",
}

_CONTENT_STAGE_WEIGHTS = {
    "concept_generation": 0.90,
    "scene_planning": 0.85,
    "prompt_creation": 0.80,
    "qc_decision": 0.95,
    "script_validation": 0.75,
    "trend_research": 0.70,
    "clip_generation": 0.60,
    "render_assembly": 0.50,
    "publish_payload": 0.65,
}


def _supabase_headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def _text_similarity(left: str, right: str) -> float:
    left_tokens = set(left.lower().split())
    right_tokens = set(right.lower().split())
    if not left_tokens or not right_tokens:
        return 0.0
    intersection = left_tokens & right_tokens
    union = left_tokens | right_tokens
    return len(intersection) / len(union)


def _fetch_existing_insights_for_category(category: str, limit: int = 20) -> list[str]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return []

    try:
        response = httpx.get(
            f"{SUPABASE_URL}/rest/v1/enoch_brain_insights",
            headers=_supabase_headers(),
            params={
                "select": "insight",
                "category": f"eq.{category}",
                "is_active": "eq.true",
                "limit": str(limit),
            },
            timeout=4.0,
        )
        response.raise_for_status()
    except Exception as exc:  # pragma: no cover - network/config dependent
        logger.warning("admission_control: failed to fetch existing insights: %s", exc)
        return []

    return [row["insight"] for row in response.json() if row.get("insight")]


def _score_novelty(candidate_insight: str, existing_insights: list[str]) -> float:
    if not existing_insights:
        return 1.0

    max_similarity = max(_text_similarity(candidate_insight, existing) for existing in existing_insights)
    return 1.0 - max_similarity


def _score_future_utility(
    insight: str,
    category: str,
    source_stage: str,
    metadata: dict[str, Any],
) -> float:
    stage_weight = _CONTENT_STAGE_WEIGHTS.get(source_stage, 0.50)
    actionable_signals = [
        "always",
        "never",
        "avoid",
        "prefer",
        "use",
        "works",
        "fails",
        "increases",
        "decreases",
        "best",
        "worst",
        "hook",
        "score",
    ]
    action_score = min(sum(1 for signal in actionable_signals if signal in insight.lower()) / 4, 1.0)
    category_bonus = 0.15 if category in {"approval_pattern", "rejection_pattern"} else 0.0
    return min(stage_weight * 0.60 + action_score * 0.40 + category_bonus, 1.0)


def _score_relevance(category: str, insight: str) -> float:
    base = 0.85 if category in _DOMAIN_RELEVANT_CATEGORIES else 0.40
    content_keywords = [
        "video",
        "hook",
        "scene",
        "script",
        "audience",
        "engagement",
        "platform",
        "tiktok",
        "reel",
        "short",
        "prompt",
        "sora",
        "tone",
        "viral",
        "concept",
        "cta",
        "retention",
        "watch",
    ]
    keyword_hits = sum(1 for keyword in content_keywords if keyword in insight.lower())
    keyword_boost = min(keyword_hits * 0.03, 0.15)
    return min(base + keyword_boost, 1.0)


def score_admission(
    insight: str,
    category: str,
    source_stage: str,
    confidence: float,
    is_recent_project: bool = True,
    metadata: dict[str, Any] | None = None,
    _existing_override: list[str] | None = None,
) -> AdmissionScore:
    metadata = metadata or {}
    existing = (
        _existing_override
        if _existing_override is not None
        else _fetch_existing_insights_for_category(category)
    )

    novelty = _score_novelty(insight, existing)
    future_utility = _score_future_utility(insight, category, source_stage, metadata)
    relevance = _score_relevance(category, insight)
    recency_weight = 0.90 if is_recent_project else 0.50

    return AdmissionScore(
        future_utility=future_utility,
        confidence=min(max(confidence, 0.0), 1.0),
        novelty=novelty,
        relevance=relevance,
        recency_weight=recency_weight,
    )


def gate_insight_write(
    insight: str,
    category: str,
    source_stage: str,
    confidence: float,
    is_recent_project: bool = True,
    metadata: dict[str, Any] | None = None,
) -> tuple[bool, AdmissionScore]:
    score = score_admission(
        insight=insight,
        category=category,
        source_stage=source_stage,
        confidence=confidence,
        is_recent_project=is_recent_project,
        metadata=metadata,
    )

    if score.admitted:
        logger.info(
            "admission_control: ADMITTED | category=%s stage=%s composite=%.3f",
            category,
            source_stage,
            score.composite,
        )
    else:
        logger.info(
            "admission_control: REJECTED | category=%s stage=%s composite=%.3f novelty=%.3f",
            category,
            source_stage,
            score.composite,
            score.novelty,
        )

    return score.admitted, score
