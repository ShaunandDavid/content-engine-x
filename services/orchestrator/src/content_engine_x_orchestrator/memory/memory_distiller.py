"""Compress pipeline outcomes into reusable brain insights."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

import httpx

from .admission_control import NOVELTY_MIN, SIMILARITY_REJECT_THRESHOLD, gate_insight_write

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


@dataclass
class DistilledInsight:
    insight: str
    category: str
    source_stage: str
    confidence: float
    metadata: dict[str, Any]


def _supabase_headers(prefer: str = "return=minimal") -> dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def _text_similarity(left: str, right: str) -> float:
    left_tokens = set(left.lower().split())
    right_tokens = set(right.lower().split())
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def _fetch_existing_rows(category: str, limit: int = 20) -> list[dict[str, Any]]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return []

    try:
        response = httpx.get(
            f"{SUPABASE_URL}/rest/v1/enoch_brain_insights",
            headers=_supabase_headers("return=representation"),
            params={
                "select": "id,insight,confidence,reinforcement_count",
                "category": f"eq.{category}",
                "is_active": "eq.true",
                "limit": str(limit),
            },
            timeout=4.0,
        )
        response.raise_for_status()
        return response.json()
    except Exception as exc:  # pragma: no cover - network/config dependent
        logger.warning("memory_distiller: failed to fetch existing rows: %s", exc)
        return []


def _find_duplicate_insight(candidate: DistilledInsight) -> dict[str, Any] | None:
    best_match: dict[str, Any] | None = None
    best_similarity = 0.0
    for row in _fetch_existing_rows(candidate.category):
        similarity = _text_similarity(candidate.insight, str(row.get("insight", "")))
        if similarity > best_similarity:
            best_similarity = similarity
            best_match = row

    if best_match and best_similarity >= SIMILARITY_REJECT_THRESHOLD:
        return best_match
    return None


def _write_insight_to_supabase(
    insight: DistilledInsight,
    project_id: str | None,
    run_id: str | None,
    admission_score_metadata: dict[str, float],
) -> bool:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        logger.debug("memory_distiller: supabase not configured, skipping write")
        return False

    metadata = {
        **insight.metadata,
        "admission_score": admission_score_metadata,
        "distiller_version": "1.0",
    }

    legacy_payload = {
        "id": str(uuid4()),
        "category": insight.category,
        "insight": insight.insight,
        "confidence": insight.confidence,
        "source": "self_reflection",
        "source_project_id": project_id,
        "source_run_id": run_id,
        "reinforcement_count": 1,
        "contradiction_count": 0,
        "is_active": True,
        "superseded_by": None,
        "tags": [],
        "metadata": metadata,
    }

    enhanced_payload = {
        **legacy_payload,
        "source_stage": insight.source_stage,
        "memory_tier": "episodic",
        "admission_score": admission_score_metadata,
        "distiller_version": "1.0",
    }

    url = f"{SUPABASE_URL}/rest/v1/enoch_brain_insights"
    try:
        response = httpx.post(url, headers=_supabase_headers(), json=enhanced_payload, timeout=5.0)
        response.raise_for_status()
        return True
    except Exception as enhanced_exc:  # pragma: no cover - network/config dependent
        logger.info("memory_distiller: enhanced insert failed, retrying legacy payload: %s", enhanced_exc)

    try:
        response = httpx.post(url, headers=_supabase_headers(), json=legacy_payload, timeout=5.0)
        response.raise_for_status()
        return True
    except Exception as exc:  # pragma: no cover - network/config dependent
        logger.warning("memory_distiller: write failed: %s", exc)
        return False


def _reinforce_existing_insight(existing_row: dict[str, Any], candidate_confidence: float) -> bool:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return False

    existing_id = existing_row.get("id")
    if not existing_id:
        return False

    current_confidence = float(existing_row.get("confidence", 0.5))
    current_reinforcement_count = int(existing_row.get("reinforcement_count", 1))
    new_confidence = min(max(current_confidence, candidate_confidence) + 0.05, 0.99)

    try:
        response = httpx.patch(
            f"{SUPABASE_URL}/rest/v1/enoch_brain_insights",
            headers=_supabase_headers(),
            params={"id": f"eq.{existing_id}"},
            json={
                "confidence": new_confidence,
                "reinforcement_count": current_reinforcement_count + 1,
            },
            timeout=4.0,
        )
        response.raise_for_status()
        return True
    except Exception as exc:  # pragma: no cover - network/config dependent
        logger.warning("memory_distiller: reinforce failed: %s", exc)
        return False


def _extract_from_concept(state: dict[str, Any]) -> list[DistilledInsight]:
    insights: list[DistilledInsight] = []
    concept = state.get("concept", {})
    brief = state.get("brief", {})
    project_config = state.get("project_config", {})

    if not concept:
        return insights

    hook = str(concept.get("hook", "")).strip()
    if hook and len(hook) > 10:
        insights.append(
            DistilledInsight(
                insight=(
                    f"Hook pattern '{hook[:60]}...' generated for "
                    f"audience={brief.get('audience', 'unknown')}, "
                    f"tone={project_config.get('tone', 'unknown')}"
                ),
                category="content_preference",
                source_stage="concept_generation",
                confidence=0.65,
                metadata={
                    "hook_preview": hook[:80],
                    "tone": project_config.get("tone"),
                    "audience": brief.get("audience"),
                    "platforms": project_config.get("platforms", []),
                },
            )
        )

    return insights


def _extract_from_script_validation(state: dict[str, Any]) -> list[DistilledInsight]:
    insights: list[DistilledInsight] = []
    score_data = state.get("script_score") or {}
    score = 0.0
    if isinstance(score_data, dict):
        try:
            score = float(score_data.get("overall_score", 0.0))
        except (TypeError, ValueError):
            score = 0.0
    elif isinstance(score_data, (int, float)):
        score = float(score_data)

    approved = bool(state.get("script_approved", False))
    notes = str(state.get("script_revision_notes", "") or "")
    revision_count = int(state.get("script_revision_count", 0) or 0)

    if approved and score >= 70:
        insights.append(
            DistilledInsight(
                insight=(
                    f"Script scored {score:.1f}/100 and was approved after {revision_count} revision(s). "
                    f"Notes: {notes[:100] if notes else 'none'}"
                ),
                category="approval_pattern",
                source_stage="script_validation",
                confidence=min(0.50 + max(score - 70, 0) * 0.01, 0.95),
                metadata={
                    "script_score": score,
                    "revisions": revision_count,
                    "notes": notes[:200],
                },
            )
        )
    elif not approved and notes:
        insights.append(
            DistilledInsight(
                insight=f"Script rejected at score {score:.1f}/100. Rejection reason: {notes[:120]}",
                category="rejection_pattern",
                source_stage="script_validation",
                confidence=0.80,
                metadata={
                    "script_score": score,
                    "revisions": revision_count,
                    "notes": notes[:200],
                },
            )
        )

    return insights


def _extract_from_qc_decision(state: dict[str, Any]) -> list[DistilledInsight]:
    approvals = state.get("approvals", [])
    if not approvals:
        return []

    latest = approvals[-1]
    status = str(latest.get("status", ""))
    notes = str(latest.get("notes", "") or "")
    resolved_by = str(latest.get("resolved_by", "") or "")
    project_config = state.get("project_config", {})

    if status == "approved":
        return [
            DistilledInsight(
                insight=(
                    f"QC approved with tone={project_config.get('tone')} "
                    f"platforms={project_config.get('platforms', [])}. "
                    f"Notes: {notes[:150] if notes else 'none'}"
                ),
                category="approval_pattern",
                source_stage="qc_decision",
                confidence=0.75 if resolved_by == "system" else 0.85,
                metadata={
                    "approval_status": status,
                    "resolved_by": resolved_by,
                    "tone": project_config.get("tone"),
                    "platforms": project_config.get("platforms", []),
                },
            )
        ]

    if status == "rejected":
        return [
            DistilledInsight(
                insight=f"QC rejected the run. Notes: {notes[:150] if notes else 'none'}",
                category="rejection_pattern",
                source_stage="qc_decision",
                confidence=0.85,
                metadata={"approval_status": status, "resolved_by": resolved_by},
            )
        ]

    return []


def _extract_from_prompt_creation(state: dict[str, Any]) -> list[DistilledInsight]:
    insights: list[DistilledInsight] = []
    prompts = state.get("prompt_versions", [])
    concept = state.get("concept", {})

    for prompt_obj in prompts[:2]:
        compiled = str(prompt_obj.get("compiled_prompt", "") or "")
        if len(compiled) <= 20:
            continue

        motion_score = prompt_obj.get("motion_score")
        motion_suffix = f" motion_score={motion_score}" if motion_score is not None else ""
        insights.append(
            DistilledInsight(
                insight=(
                    f"Sora prompt for visual_direction='{str(concept.get('visual_direction', ''))[:60]}': "
                    f"'{compiled[:100]}...'{motion_suffix}"
                ),
                category="prompt_quality",
                source_stage="prompt_creation",
                confidence=0.60,
                metadata={
                    "prompt_preview": compiled[:150],
                    "motion_score": motion_score,
                    "visual_direction": concept.get("visual_direction", ""),
                },
            )
        )

    return insights


def _extract_workflow_optimization(state: dict[str, Any]) -> list[DistilledInsight]:
    insights: list[DistilledInsight] = []
    attempts = state.get("stage_attempts", [])
    errors = state.get("errors", [])

    if errors:
        error_summary = "; ".join(str(error)[:80] for error in errors[:3])
        insights.append(
            DistilledInsight(
                insight=f"Pipeline completed with errors: {error_summary}",
                category="workflow_optimization",
                source_stage="publish_payload",
                confidence=0.75,
                metadata={"error_count": len(errors), "errors_preview": error_summary},
            )
        )

    retry_counts: dict[str, int] = {}
    for attempt in attempts:
        stage = str(attempt.get("stage", ""))
        retry_counts[stage] = retry_counts.get(stage, 0) + 1

    for stage, count in retry_counts.items():
        if count >= 2:
            insights.append(
                DistilledInsight(
                    insight=f"Stage '{stage}' required {count} attempts in this run and may indicate instability",
                    category="workflow_optimization",
                    source_stage=stage,
                    confidence=0.70,
                    metadata={"retry_count": count, "stage": stage},
                )
            )

    return insights


def distill_run(
    state: dict[str, Any],
    project_id: str | None = None,
    run_id: str | None = None,
    is_recent_project: bool = True,
) -> dict[str, Any]:
    project_id = project_id or state.get("project_id")
    run_id = run_id or state.get("workflow_run_id") or state.get("run_id")

    candidates: list[DistilledInsight] = []
    candidates.extend(_extract_from_concept(state))
    candidates.extend(_extract_from_script_validation(state))
    candidates.extend(_extract_from_qc_decision(state))
    candidates.extend(_extract_from_prompt_creation(state))
    candidates.extend(_extract_workflow_optimization(state))

    admitted_count = 0
    rejected_count = 0
    reinforced_count = 0
    admitted_previews: list[str] = []

    for candidate in candidates:
        should_write, score = gate_insight_write(
            insight=candidate.insight,
            category=candidate.category,
            source_stage=candidate.source_stage,
            confidence=candidate.confidence,
            is_recent_project=is_recent_project,
            metadata=candidate.metadata,
        )

        if should_write:
            if _write_insight_to_supabase(
                insight=candidate,
                project_id=str(project_id) if project_id else None,
                run_id=str(run_id) if run_id else None,
                admission_score_metadata=score.to_dict(),
            ):
                admitted_count += 1
                admitted_previews.append(f"{candidate.category}: {candidate.insight[:60]}")
            else:
                rejected_count += 1
            continue

        duplicate_row = None
        if score.novelty < NOVELTY_MIN:
            duplicate_row = _find_duplicate_insight(candidate)

        if duplicate_row and _reinforce_existing_insight(duplicate_row, candidate.confidence):
            reinforced_count += 1
            continue

        rejected_count += 1

    logger.info(
        "memory_distiller: run=%s project=%s admitted=%d reinforced=%d rejected=%d",
        run_id,
        project_id,
        admitted_count,
        reinforced_count,
        rejected_count,
    )

    return {
        "candidates_evaluated": len(candidates),
        "insights_admitted": admitted_count,
        "insights_reinforced": reinforced_count,
        "insights_rejected": rejected_count,
        "admitted_previews": admitted_previews,
    }
