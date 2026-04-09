"""brand_profile.py — Load brand intelligence before any generation node runs.

Called at the START of the pipeline in brief_intake or as a pre-hook.
Injects brand context into WorkflowState so every downstream node
knows exactly who it is making videos for.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def _headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def load_brand_profile(
    project_id: str | None = None,
    operator_user_id: str | None = None,
) -> dict[str, Any] | None:
    """
    Load brand profile from Supabase.
    Returns None if not found — nodes must handle gracefully.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None

    params = []
    if project_id:
        params.append(f"project_id=eq.{project_id}")
    elif operator_user_id:
        params.append(f"operator_user_id=eq.{operator_user_id}")
    else:
        return None

    params.append("limit=1")
    params.append("order=updated_at.desc")

    url = f"{SUPABASE_URL}/rest/v1/enoch_brand_profiles?{'&'.join(params)}"

    try:
        response = httpx.get(url, headers=_headers(), timeout=5.0)
        response.raise_for_status()
        results = response.json()
        return results[0] if results else None
    except Exception as exc:
        logger.warning("brand_profile: failed to load: %s", exc)
        return None


def build_brand_context_block(profile: dict[str, Any] | None) -> str:
    """
    Build a terse, prompt-injectable brand context string.
    Used by concept_generation, scene_planning, prompt_creation.
    """
    if not profile:
        return ""

    lines = [f"[BRAND PROFILE — {profile.get('brand_name', 'Unknown Brand')}]"]

    if profile.get("brand_tagline"):
        lines.append(f"Tagline: {profile['brand_tagline']}")

    lines.append(f"Industry: {profile.get('industry', 'unknown')}")
    lines.append(f"Voice: {profile.get('brand_voice', 'professional')}")

    if profile.get("tone_adjectives"):
        lines.append(f"Tone: {', '.join(profile['tone_adjectives'])}")

    lines.append(f"Audience: {profile.get('target_audience', 'general')}")

    if profile.get("audience_pain_points"):
        lines.append(f"Pain points: {'; '.join(profile['audience_pain_points'][:3])}")

    if profile.get("audience_desires"):
        lines.append(f"Desires: {'; '.join(profile['audience_desires'][:3])}")

    if profile.get("visual_style"):
        lines.append(f"Visual style: {profile['visual_style']}")

    if profile.get("primary_color"):
        lines.append(f"Brand color: {profile['primary_color']}")

    if profile.get("avoid_patterns"):
        lines.append(f"AVOID these patterns: {'; '.join(profile['avoid_patterns'])}")

    if profile.get("top_performing_hooks"):
        lines.append(f"Past winning hooks: {'; '.join(profile['top_performing_hooks'][:2])}")

    if profile.get("content_pillars"):
        lines.append(f"Content pillars: {', '.join(profile['content_pillars'])}")

    lines.append("[Apply this brand identity to every creative decision.]")
    return "\n".join(lines)
