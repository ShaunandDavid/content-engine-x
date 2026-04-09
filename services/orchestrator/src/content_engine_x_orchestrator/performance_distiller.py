"""performance_distiller.py — Convert video performance data into brain insights.

Called periodically (or triggered after performance data is ingested).
Extracts high-signal learnings from view counts, completion rates, and viral events
and writes them to enoch_brain_insights via admission control.

This is the self-learning loop. Every published video teaches Enoch what works.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from .memory.admission_control import gate_insight_write
from .memory.memory_distiller import DistilledInsight, _write_insight_to_supabase

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Performance thresholds for learning signal
HIGH_COMPLETION_THRESHOLD = 0.70   # 70%+ completion = strong content
VIRAL_VIEWS_THRESHOLD = 100_000    # 100k views = viral
GOOD_VIEWS_THRESHOLD = 10_000      # 10k views = performing well
LOW_COMPLETION_THRESHOLD = 0.30    # below 30% = content problem


def _headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def _fetch_undistilled_performances() -> list[dict[str, Any]]:
    """Fetch performance records that haven't been distilled yet."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return []

    url = (
        f"{SUPABASE_URL}/rest/v1/enoch_video_performance"
        f"?feedback_distilled=eq.false&order=views.desc&limit=20"
    )
    try:
        response = httpx.get(url, headers=_headers(), timeout=5.0)
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        logger.warning("performance_distiller: fetch failed: %s", exc)
        return []


def _mark_distilled(record_id: str) -> None:
    """Mark a performance record as distilled."""
    url = f"{SUPABASE_URL}/rest/v1/enoch_video_performance?id=eq.{record_id}"
    try:
        httpx.patch(
            url,
            headers={**_headers(), "Prefer": "return=minimal"},
            json={"feedback_distilled": True, "distilled_at": "now()"},
            timeout=4.0,
        )
    except Exception as exc:
        logger.warning("performance_distiller: mark distilled failed: %s", exc)


def _update_brand_profile_hooks(project_id: str, hook: str, brand_name: str) -> None:
    """Add a proven viral hook to the brand's top_performing_hooks list."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return

    url = (
        f"{SUPABASE_URL}/rest/v1/enoch_brand_profiles"
        f"?project_id=eq.{project_id}&select=id,top_performing_hooks,total_videos_produced"
    )
    try:
        response = httpx.get(url, headers=_headers(), timeout=4.0)
        profiles = response.json()
        if not profiles:
            return

        profile = profiles[0]
        current_hooks: list[str] = profile.get("top_performing_hooks") or []
        total_produced: int = profile.get("total_videos_produced") or 0

        # Prepend new hook if not already present, keep top 10
        if hook not in current_hooks:
            current_hooks.insert(0, hook)
            current_hooks = current_hooks[:10]

        patch_url = f"{SUPABASE_URL}/rest/v1/enoch_brand_profiles?id=eq.{profile['id']}"
        httpx.patch(
            patch_url,
            headers={**_headers(), "Prefer": "return=minimal"},
            json={
                "top_performing_hooks": current_hooks,
                "total_videos_produced": total_produced + 1,
            },
            timeout=4.0,
        )
        logger.info("performance_distiller: updated brand hooks for %s", brand_name)
    except Exception as exc:
        logger.warning("performance_distiller: brand hook update failed: %s", exc)


def _extract_insights_from_performance(perf: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract learning insights from a single performance record."""
    insights: list[dict[str, Any]] = []

    views = perf.get("views", 0)
    completion = perf.get("completion_rate", 0)
    went_viral = perf.get("went_viral", False)
    hook = perf.get("hook_text", "") or ""
    framework = perf.get("viral_framework", "") or ""
    brand = perf.get("brand_name", "") or ""
    platform = perf.get("platform", "") or ""
    motion_scores: list[int] = perf.get("motion_scores") or []
    avg_motion = sum(motion_scores) / len(motion_scores) if motion_scores else 4.0

    # ── Viral hook pattern ───────────────────────────────────────────────────
    if went_viral and hook:
        insights.append({
            "insight": (
                f"Viral hook ({views:,} views on {platform}): '{hook[:100]}' "
                f"— framework: {framework}"
            ),
            "category": "approval_pattern",
            "source_stage": "concept_generation",
            "confidence": 0.95,
            "metadata": {
                "views": views,
                "platform": platform,
                "framework": framework,
                "hook": hook,
            },
        })

    # ── High completion → strong content structure ───────────────────────────
    if completion >= HIGH_COMPLETION_THRESHOLD and views >= GOOD_VIEWS_THRESHOLD:
        insights.append({
            "insight": (
                f"Framework '{framework}' achieved {completion:.0%} completion rate "
                f"({views:,} views) on {platform} for brand '{brand}'"
            ),
            "category": "approval_pattern",
            "source_stage": "scene_planning",
            "confidence": min(0.65 + completion * 0.30, 0.95),
            "metadata": {
                "completion_rate": completion,
                "views": views,
                "framework": framework,
                "platform": platform,
            },
        })

    # ── Low completion → content structure problem ───────────────────────────
    if completion < LOW_COMPLETION_THRESHOLD and views >= 1_000:
        insights.append({
            "insight": (
                f"Low completion ({completion:.0%}) with {views:,} views on {platform} "
                f"using framework '{framework}' — audience dropping early, hook did not hold"
            ),
            "category": "rejection_pattern",
            "source_stage": "scene_planning",
            "confidence": 0.80,
            "metadata": {
                "completion_rate": completion,
                "views": views,
                "framework": framework,
            },
        })

    # ── Motion score correlation ─────────────────────────────────────────────
    if views >= GOOD_VIEWS_THRESHOLD and motion_scores:
        insights.append({
            "insight": (
                f"Average motion score {avg_motion:.1f}/7 correlated with "
                f"{views:,} views and {completion:.0%} completion on {platform}"
            ),
            "category": "prompt_quality",
            "source_stage": "prompt_creation",
            "confidence": 0.65,
            "metadata": {
                "avg_motion_score": avg_motion,
                "views": views,
                "completion_rate": completion,
            },
        })

    # ── Platform performance ─────────────────────────────────────────────────
    if views >= GOOD_VIEWS_THRESHOLD:
        insights.append({
            "insight": (
                f"Content for '{brand}' performed well on {platform}: "
                f"{views:,} views, {completion:.0%} completion — "
                f"visual style and framework combination is working"
            ),
            "category": "platform_performance",
            "source_stage": "publish_payload",
            "confidence": 0.75,
            "metadata": {"platform": platform, "views": views, "brand": brand},
        })

    return insights


def distill_performance_data() -> dict[str, Any]:
    """Main entry point. Fetch undistilled performance records,
    extract insights, run admission control, write to brain.
    """
    performances = _fetch_undistilled_performances()
    if not performances:
        logger.info("performance_distiller: no undistilled records found")
        return {"processed": 0, "admitted": 0, "rejected": 0}

    total_admitted = 0
    total_rejected = 0
    total_processed = 0

    for perf in performances:
        candidates = _extract_insights_from_performance(perf)
        went_viral = perf.get("went_viral", False)
        hook = perf.get("hook_text", "") or ""
        project_id = perf.get("project_id")
        brand_name = perf.get("brand_name", "") or ""

        for candidate in candidates:
            should_write, score = gate_insight_write(
                insight=candidate["insight"],
                category=candidate["category"],
                source_stage=candidate["source_stage"],
                confidence=candidate["confidence"],
                is_recent_project=True,
                metadata=candidate["metadata"],
            )

            if should_write:
                written = _write_insight_to_supabase(
                    insight=DistilledInsight(
                        insight=candidate["insight"],
                        category=candidate["category"],
                        source_stage=candidate["source_stage"],
                        confidence=candidate["confidence"],
                        metadata=candidate["metadata"],
                    ),
                    project_id=str(project_id) if project_id else None,
                    run_id=str(perf.get("run_id")) if perf.get("run_id") else None,
                    admission_score_metadata=score.to_dict(),
                )
                if written:
                    total_admitted += 1
                else:
                    total_rejected += 1
            else:
                total_rejected += 1

        # Update brand profile with viral hooks
        if went_viral and hook and project_id:
            _update_brand_profile_hooks(
                project_id=str(project_id),
                hook=hook,
                brand_name=brand_name,
            )

        _mark_distilled(str(perf["id"]))
        total_processed += 1

    logger.info(
        "performance_distiller: processed=%d admitted=%d rejected=%d",
        total_processed,
        total_admitted,
        total_rejected,
    )

    return {
        "processed": total_processed,
        "admitted": total_admitted,
        "rejected": total_rejected,
    }
