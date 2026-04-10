from __future__ import annotations

import hashlib
import logging
import os
import tempfile
import time
from functools import cmp_to_key, lru_cache
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from openai import APIError, OpenAI
from pydantic import BaseModel

from ..config import load_settings
from ..models import ClipRequest, JobStatus, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt

logger = logging.getLogger(__name__)

VIDEO_MODELS = ("sora-2", "sora-2-pro")
INITIAL_SEGMENT_SECONDS = (4, 8, 12)
EXTENSION_SEGMENT_SECONDS = (4, 8, 12, 16, 20)
TOTAL_DURATION_OPTIONS = (8, 12, 16, 20, 24, 32, 40, 60)
DEFAULT_POLL_TIMEOUT_MS = 30 * 60 * 1000
DEFAULT_OPENAI_VIDEO_BASE_URL = "https://api.openai.com/v1"
SMART_DURATION_OPENING_BUFFER_SECONDS = 2
SMART_DURATION_ENDING_BUFFER_SECONDS = 2
SMART_DURATION_BRAND_HOLD_SECONDS = 2

TONE_STYLE_MAP = {
    "authority": "documentary",
    "cinematic": "cinematic",
    "educational": "documentary",
    "energetic": "ad-promo",
    "playful": "uplifting",
}
ASPECT_PLATFORM_MAP = {"9:16": "tiktok-reels-shorts", "16:9": "youtube-horizontal"}
FORMAT_BY_MODEL_AND_ASPECT = {
    "sora-2": {"9:16": "720x1280", "16:9": "1280x720"},
    "sora-2-pro": {"9:16": "1024x1792", "16:9": "1792x1024"},
}
PLANNER_OPTIONS = {
    "standard": {"label": "Standard planner", "model": "gpt-5-mini", "reasoning_effort": "low"},
    "premium": {"label": "Premium planner", "model": "gpt-5.4", "reasoning_effort": "low"},
}
PLATFORM_PRESETS = {
    "tiktok-reels-shorts": {
        "label": "TikTok / Reels / Shorts",
        "description": "Vertical-first short-form social output.",
    },
    "youtube-horizontal": {
        "label": "YouTube horizontal",
        "description": "Landscape storytelling for YouTube and widescreen feeds.",
    },
    "custom": {"label": "Custom", "description": "Keep the current format and tune the brief manually."},
}
STYLE_PRESETS = {
    "cinematic": {"label": "cinematic", "description": "Polished framing, motivated lighting, and premium motion."},
    "raw-gritty": {"label": "raw / gritty", "description": "Rough texture, imperfect beauty, and tactile realism."},
    "uplifting": {"label": "uplifting", "description": "Optimistic movement, brighter energy, and emotional lift."},
    "luxury": {"label": "luxury", "description": "Controlled elegance, rich materials, and aspirational tone."},
    "documentary": {"label": "documentary", "description": "Observational camera language and grounded authenticity."},
    "ad-promo": {"label": "ad / promo", "description": "Clear product-style intention with sharp commercial pacing."},
}
FORMAT_OPTIONS = {
    "1024x1792": {
        "label": "9:16 phone framing with higher resolution",
        "note": "Renders at 1024x1792, the closest Sora-supported vertical size to Full HD.",
        "aspect": "vertical",
    },
    "1792x1024": {
        "label": "16:9 widescreen framing with higher resolution",
        "note": "Renders at 1792x1024, the closest Sora-supported widescreen size to Full HD.",
        "aspect": "horizontal",
    },
    "720x1280": {"label": "9:16 phone framing", "note": "Renders at 720x1280.", "aspect": "vertical"},
    "1280x720": {"label": "16:9 widescreen framing", "note": "Renders at 1280x720.", "aspect": "horizontal"},
}


class PromptPlan(BaseModel):
    title: str
    masterPrompt: str
    initialPrompt: str
    extensionPrompts: list[str]
    recommendedModel: Literal["sora-2", "sora-2-pro"]
    recommendedSize: Literal["1024x1792", "1792x1024", "720x1280", "1280x720"]
    segmentPlan: list[int]
    captionSuggestion: str
    avoidList: list[str]


@lru_cache(maxsize=4)
def _build_openai_client(api_key: str, base_url: str) -> OpenAI:
    return OpenAI(api_key=api_key, base_url=base_url)


def _get_openai_client(settings) -> OpenAI:
    api_key = (settings.openai_api_key or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set for clip generation.")
    base_url = os.environ.get("OPENAI_VIDEO_BASE_URL", DEFAULT_OPENAI_VIDEO_BASE_URL).strip()
    return _build_openai_client(api_key, base_url or DEFAULT_OPENAI_VIDEO_BASE_URL)


def _nearest_duration(duration_seconds: int, allowed: tuple[int, ...]) -> int:
    return min(allowed, key=lambda candidate: abs(candidate - duration_seconds))


def _style_for_tone(tone: object) -> str:
    return TONE_STYLE_MAP.get(str(tone).lower(), "documentary")


def _platform_preset_for_aspect_ratio(aspect_ratio: object) -> str:
    return ASPECT_PLATFORM_MAP.get(str(aspect_ratio), "tiktok-reels-shorts")


def _format_for_model_and_aspect_ratio(model: str, aspect_ratio: object) -> str:
    aspect_key = str(aspect_ratio)
    if model in FORMAT_BY_MODEL_AND_ASPECT and aspect_key in FORMAT_BY_MODEL_AND_ASPECT[model]:
        return FORMAT_BY_MODEL_AND_ASPECT[model][aspect_key]
    return "720x1280" if aspect_key == "9:16" else "1280x720"


def _resolve_generation_model(prompt: dict[str, object], settings) -> str:
    prompt_model = str(prompt.get("model", "") or "")
    if prompt_model in VIDEO_MODELS:
        return prompt_model
    return settings.openai_sora_model


def _build_reference_assets(state: WorkflowState, prompt: dict[str, object]) -> list[dict[str, str]] | None:
    hero_image_key = str(prompt.get("reference_image_r2_key") or state.get("hero_image_r2_key") or "").strip()
    r2_public_url = str(os.environ.get("R2_PUBLIC_URL", "")).strip()
    if not hero_image_key or not r2_public_url:
        return None
    return [{"url": f"{r2_public_url.rstrip('/')}/{hero_image_key.lstrip('/')}"}]


def _download_target_path(state: WorkflowState, clip_id: str) -> Path:
    workflow_run_id = str(state.get("workflow_run_id") or state.get("run_id") or "adhoc-run")
    target_dir = Path(tempfile.gettempdir()) / "content-engine-x-orchestrator" / workflow_run_id
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir / f"{clip_id}.mp4"


def _provider_status_to_job_status(status: str) -> JobStatus:
    mapping = {
        "queued": JobStatus.QUEUED,
        "in_progress": JobStatus.RUNNING,
        "running": JobStatus.RUNNING,
        "completed": JobStatus.COMPLETED,
        "failed": JobStatus.FAILED,
    }
    return mapping.get(status, JobStatus.FAILED)


def _manual_recommendation(requested_duration: int, resolved_duration: int, execution_plan: list[int]) -> dict[str, object]:
    if requested_duration == resolved_duration:
        summary = f"Manual duration locked at {resolved_duration} seconds."
        reasons = ["Manual duration override is active."]
    else:
        summary = (
            f"Requested {requested_duration} seconds snapped to {resolved_duration} seconds "
            "to fit Sora-supported segment lengths."
        )
        reasons = ["Requested duration was snapped to the nearest Sora-supported segment length."]

    return {
        "mode": "manual",
        "requestedDuration": requested_duration,
        "resolvedDuration": resolved_duration,
        "estimatedNarrationSeconds": 0,
        "estimatedVisualSeconds": 0,
        "openingBufferSeconds": 0,
        "endingBufferSeconds": 0,
        "brandHoldSeconds": 0,
        "cappedToMax": False,
        "executionPlan": execution_plan,
        "summary": summary,
        "reasons": reasons,
    }


def _compare_plans(left: list[int], right: list[int]) -> int:
    left_short_segments = len([segment for segment in left if segment < 8])
    right_short_segments = len([segment for segment in right if segment < 8])
    if left_short_segments != right_short_segments:
        return left_short_segments - right_short_segments

    left_spread = max(left) - min(left)
    right_spread = max(right) - min(right)
    if left_spread != right_spread:
        return left_spread - right_spread

    if left[0] != right[0]:
        return right[0] - left[0]

    for index in range(max(len(left), len(right))):
        left_value = left[index] if index < len(left) else 0
        right_value = right[index] if index < len(right) else 0
        if left_value != right_value:
            return right_value - left_value

    return 0


def _build_segment_plan(total_seconds: int) -> dict[str, object]:
    if total_seconds < 4 or total_seconds % 4 != 0:
        raise RuntimeError("Total duration must be a whole number and a multiple of 4.")

    candidates: list[list[int]] = []
    best_segment_count = float("inf")
    initial_options = sorted(INITIAL_SEGMENT_SECONDS, reverse=True)
    extension_options = sorted(EXTENSION_SEGMENT_SECONDS, reverse=True)

    def search(remaining: int, is_initial: bool, current: list[int]) -> None:
        nonlocal best_segment_count
        if len(current) > best_segment_count:
            return
        if remaining == 0:
            if len(current) < best_segment_count:
                best_segment_count = len(current)
                candidates.clear()
            candidates.append(list(current))
            return

        for option in initial_options if is_initial else extension_options:
            if option > remaining:
                continue
            current.append(option)
            search(remaining - option, False, current)
            current.pop()

    search(total_seconds, True, [])
    if not candidates:
        raise RuntimeError("Unable to create a valid extension plan for that duration.")

    selected_plan = sorted(candidates, key=cmp_to_key(_compare_plans))[0]
    return {
        "segments": selected_plan,
        "totalSeconds": total_seconds,
        "initialSeconds": selected_plan[0],
        "extensionSeconds": selected_plan[1:],
    }


def _snap_duration_up(total_seconds: float) -> int:
    for duration in TOTAL_DURATION_OPTIONS:
        if duration >= total_seconds:
            return duration
    return TOTAL_DURATION_OPTIONS[-1]


def _extract_explicit_duration_seconds(rough_idea: str) -> int | None:
    import re

    match = re.search(r"\b(\d{1,3})(?:\s*|-)?(?:sec(?:ond)?s?|s)\b", rough_idea, re.IGNORECASE)
    if not match:
        return None
    seconds = int(match.group(1))
    return seconds if seconds > 0 else None


def _estimate_narration_seconds(rough_idea: str, style: str) -> float:
    import re

    words = re.findall(r"\b[\w'-]+\b", rough_idea, flags=re.UNICODE)
    if not words:
        return 0.0

    speaking_rates = {
        "cinematic": 2.35,
        "raw-gritty": 2.5,
        "uplifting": 2.7,
        "luxury": 2.2,
        "documentary": 2.15,
        "ad-promo": 2.9,
    }
    return len(words) / speaking_rates.get(style, 2.35)


def _count_matches(value: str, expression: str) -> int:
    import re

    return len(re.findall(expression, value, re.IGNORECASE))


def _estimate_visual_seconds(rough_idea: str, platform_preset: str, style: str) -> float:
    import re

    lower_idea = rough_idea.lower()
    sentence_breaks = len([part.strip() for part in re.split(r"[.!?\n]+", rough_idea) if part.strip()])
    clause_breaks = len(re.findall(r"[,;:]+", rough_idea))
    transition_cues = _count_matches(
        lower_idea,
        r"\b(then|into|from|through|reveal|show|shift|transition|build|logo|brand|cta|call to action)\b",
    )
    concept_cues = _count_matches(
        lower_idea,
        r"\b(3d|ai|visuals?|animation|scene|sequence|product|dashboard|bottleneck|workflow|sunrise|darkness|hero)\b",
    )

    beat_count = min(7, 1 + sentence_breaks + min(clause_breaks, 2) + min(transition_cues, 2) + min(concept_cues, 2))
    if platform_preset == "youtube-horizontal":
        platform_beat_duration = 3.6
    elif platform_preset == "custom":
        platform_beat_duration = 3.4
    else:
        platform_beat_duration = 3.1

    if style in {"documentary", "cinematic", "luxury"}:
        style_adjustment = 0.35
    elif style in {"ad-promo", "uplifting"}:
        style_adjustment = -0.2
    else:
        style_adjustment = 0.0

    return max(4.0, beat_count * (platform_beat_duration + style_adjustment))


def _should_add_brand_hold(rough_idea: str) -> bool:
    import re

    return bool(
        re.search(
            r"\b(logo|brand|company|title card|lockup|cta|call to action|name is|named)\b",
            rough_idea,
            re.IGNORECASE,
        )
    )


def _round_to_tenths(value: float) -> float:
    return round(value * 10) / 10


def _format_seconds(value: float) -> str:
    return f"{_round_to_tenths(value)}s"


def _build_reason_summary(
    *,
    narration_seconds: float,
    visual_seconds: float,
    platform_preset: str,
    explicit_duration_seconds: int | None,
    brand_hold_seconds: int,
) -> list[str]:
    reasons: list[str] = []

    if explicit_duration_seconds:
        reasons.append(f"Detected an explicit {_format_seconds(explicit_duration_seconds)} timing cue in the brief.")
    elif narration_seconds > 0:
        reasons.append(f"Estimated {_format_seconds(narration_seconds)} for spoken or narrated content pacing.")

    reasons.append(f"Estimated {_format_seconds(visual_seconds)} for visual beats and camera transitions.")

    if platform_preset == "tiktok-reels-shorts":
        reasons.append("Kept the pacing tight for vertical short-form viewing.")
    elif platform_preset == "youtube-horizontal":
        reasons.append("Allowed a little more breathing room for widescreen storytelling.")

    if brand_hold_seconds > 0:
        reasons.append(f"Added {brand_hold_seconds}s so the brand or hero image can land without a hard cutoff.")

    reasons.append(
        f"Always added {SMART_DURATION_OPENING_BUFFER_SECONDS}s at the front and "
        f"{SMART_DURATION_ENDING_BUFFER_SECONDS}s at the end for a cleaner intro/outro."
    )
    return reasons


def _recommend_smart_duration(
    *,
    rough_idea: str,
    platform_preset: str,
    style: str,
    requested_duration: int,
) -> dict[str, object]:
    normalized_idea = rough_idea.strip()
    if not normalized_idea:
        fallback_duration = _snap_duration_up(requested_duration)
        segment_plan = _build_segment_plan(fallback_duration)
        return {
            "mode": "smart",
            "requestedDuration": requested_duration,
            "resolvedDuration": fallback_duration,
            "estimatedNarrationSeconds": 0,
            "estimatedVisualSeconds": 0,
            "openingBufferSeconds": SMART_DURATION_OPENING_BUFFER_SECONDS,
            "endingBufferSeconds": SMART_DURATION_ENDING_BUFFER_SECONDS,
            "brandHoldSeconds": 0,
            "cappedToMax": False,
            "executionPlan": list(segment_plan["segments"]),
            "summary": "Smart snap fell back to the nearest supported duration because the brief was empty.",
            "reasons": ["No rough idea text was available for timing analysis."],
        }

    explicit_duration_seconds = _extract_explicit_duration_seconds(normalized_idea)
    narration_seconds = explicit_duration_seconds or _estimate_narration_seconds(normalized_idea, style)
    visual_seconds = _estimate_visual_seconds(normalized_idea, platform_preset, style)
    brand_hold_seconds = SMART_DURATION_BRAND_HOLD_SECONDS if _should_add_brand_hold(normalized_idea) else 0
    raw_recommended_seconds = (
        max(narration_seconds, visual_seconds, 4.0)
        + SMART_DURATION_OPENING_BUFFER_SECONDS
        + SMART_DURATION_ENDING_BUFFER_SECONDS
        + brand_hold_seconds
    )

    resolved_duration = _snap_duration_up(raw_recommended_seconds)
    segment_plan = _build_segment_plan(resolved_duration)
    summary_parts = [
        f"Estimated {_format_seconds(max(narration_seconds, visual_seconds))} of active content",
        f"plus {SMART_DURATION_OPENING_BUFFER_SECONDS}s opening buffer",
        f"and {SMART_DURATION_ENDING_BUFFER_SECONDS}s ending buffer",
    ]
    if brand_hold_seconds > 0:
        summary_parts.append(f"and {brand_hold_seconds}s brand/hero hold")

    return {
        "mode": "smart",
        "requestedDuration": requested_duration,
        "resolvedDuration": resolved_duration,
        "estimatedNarrationSeconds": _round_to_tenths(narration_seconds),
        "estimatedVisualSeconds": _round_to_tenths(visual_seconds),
        "openingBufferSeconds": SMART_DURATION_OPENING_BUFFER_SECONDS,
        "endingBufferSeconds": SMART_DURATION_ENDING_BUFFER_SECONDS,
        "brandHoldSeconds": brand_hold_seconds,
        "explicitDurationSeconds": _round_to_tenths(explicit_duration_seconds) if explicit_duration_seconds else None,
        "cappedToMax": raw_recommended_seconds > TOTAL_DURATION_OPTIONS[-1],
        "executionPlan": list(segment_plan["segments"]),
        "summary": f"{', '.join(summary_parts)}, then snapped up to {resolved_duration}s for a cleaner finish.",
        "reasons": _build_reason_summary(
            narration_seconds=narration_seconds,
            visual_seconds=visual_seconds,
            platform_preset=platform_preset,
            explicit_duration_seconds=explicit_duration_seconds,
            brand_hold_seconds=brand_hold_seconds,
        ),
    }


def _resolve_duration_plan(
    *,
    prompt_text: str,
    requested_duration_seconds: int,
    platform_preset: str,
    style: str,
) -> dict[str, object]:
    if requested_duration_seconds <= 12:
        resolved_duration = _nearest_duration(requested_duration_seconds, INITIAL_SEGMENT_SECONDS)
        segment_plan = _build_segment_plan(resolved_duration)
        return {
            "totalDuration": resolved_duration,
            "segmentPlan": segment_plan,
            "recommendation": _manual_recommendation(
                requested_duration_seconds,
                resolved_duration,
                list(segment_plan["segments"]),
            ),
        }

    if requested_duration_seconds % 4 == 0:
        segment_plan = _build_segment_plan(requested_duration_seconds)
        return {
            "totalDuration": requested_duration_seconds,
            "segmentPlan": segment_plan,
            "recommendation": _manual_recommendation(
                requested_duration_seconds,
                requested_duration_seconds,
                list(segment_plan["segments"]),
            ),
        }

    recommendation = _recommend_smart_duration(
        rough_idea=prompt_text,
        platform_preset=platform_preset,
        style=style,
        requested_duration=requested_duration_seconds,
    )
    return {
        "totalDuration": int(recommendation["resolvedDuration"]),
        "segmentPlan": _build_segment_plan(int(recommendation["resolvedDuration"])),
        "recommendation": recommendation,
    }


def _coerce_prompt_plan_extension_count(plan: PromptPlan, expected_extension_count: int) -> PromptPlan:
    if len(plan.extensionPrompts) == expected_extension_count:
        return plan

    plan_data = plan.model_dump(mode="python")
    if expected_extension_count == 0:
        plan_data["extensionPrompts"] = []
        return PromptPlan.model_validate(plan_data)

    if len(plan.extensionPrompts) > expected_extension_count:
        plan_data["extensionPrompts"] = plan.extensionPrompts[:expected_extension_count]
        return PromptPlan.model_validate(plan_data)

    prompts = list(plan.extensionPrompts)
    seed_prompt = prompts[-1] if prompts else plan.initialPrompt
    while len(prompts) < expected_extension_count:
        prompts.append(
            f"{seed_prompt} Continue directly from the final frame and preserve continuity for the next extension segment."
        )

    plan_data["extensionPrompts"] = prompts
    return PromptPlan.model_validate(plan_data)


def _repair_prompt_plan(
    *,
    client: OpenAI,
    planner_model: str,
    reasoning_effort: str,
    original_plan: PromptPlan,
    expected_extension_count: int,
    execution_plan: list[int],
) -> PromptPlan:
    response = client.responses.parse(
        model=planner_model,
        reasoning={"effort": reasoning_effort},
        input=[
            {
                "role": "system",
                "content": (
                    "You repair structured Sora prompt plans. Keep the creative direction intact, "
                    "but fix prompt counts so the plan exactly matches the execution chain."
                ),
            },
            {
                "role": "user",
                "content": "\n".join(
                    [
                        f"The execution segment plan is fixed at {execution_plan}.",
                        "The initialPrompt already covers segment 1.",
                        f"Return exactly {expected_extension_count} extension prompts for the continuation segments only.",
                        "Do not add or remove any fields from the JSON schema.",
                        "If there are too many extension prompts, merge or remove the least necessary extras while preserving continuity.",
                        "If there are too few extension prompts, split or expand the later beats so every remaining segment has one continuation prompt.",
                        f"Original plan JSON: {original_plan.model_dump_json()}",
                    ]
                ),
            },
        ],
        text_format=PromptPlan,
    )
    parsed = response.output_parsed
    return parsed if parsed is not None else original_plan


def _plan_segment_prompts(
    *,
    client: OpenAI,
    prompt_text: str,
    total_duration: int,
    execution_plan: list[int],
    platform_preset: str,
    style: str,
    model: str,
    format_id: str,
) -> dict[str, object]:
    if len(execution_plan) <= 1:
        return {"masterPrompt": prompt_text, "segmentPrompts": [prompt_text], "promptPlan": None}

    planner = PLANNER_OPTIONS["standard"]
    platform = PLATFORM_PRESETS[platform_preset]
    style_preset = STYLE_PRESETS[style]
    format_info = FORMAT_OPTIONS[format_id]
    expected_extension_count = max(len(execution_plan) - 1, 0)

    response = client.responses.parse(
        model=planner["model"],
        reasoning={"effort": planner["reasoning_effort"]},
        input=[
            {
                "role": "system",
                "content": (
                    "You are a high-end creative director and cinematographer. Build Sora-ready "
                    "prompt plans for continuous social video generation. Be visually concrete, "
                    "disciplined, and continuity-aware."
                ),
            },
            {
                "role": "user",
                "content": "\n".join(
                    [
                        f"The user's rough idea: {prompt_text}",
                        f"Platform preset: {platform['label']}. {platform['description']}",
                        f"Requested style / vibe: {style_preset['label']}. {style_preset['description']}",
                        f"Requested duration: {total_duration} seconds.",
                        f"Execution segment plan is fixed and must be returned exactly as {execution_plan}.",
                        "The first segment is a fresh generation. Remaining segments are video extensions chained for continuity.",
                        f"Chosen delivery format: {format_info['label']}. Actual OpenAI render size: {format_id}. {format_info['note']}",
                        f"Use the {planner['label']} setting while planning. The current planner model is {planner['model']}.",
                        f"Chosen generation model from the orchestrator: {model}. You may still recommend sora-2 or sora-2-pro in the JSON.",
                        "Avoid directives from the user: none supplied.",
                        "Return structured JSON only.",
                        "Master prompt rules:",
                        "- Write like a premium director brief, not vague user language.",
                        "- Keep one continuous scene and visual world instead of a montage.",
                        "- Be specific about subject, action, camera, lighting, palette, texture, pace, and motion.",
                        "- Optimize for social media watchability and clean visual intent.",
                        "Initial prompt rules:",
                        "- Establish the subject, setting, camera language, lighting motivation, palette, and movement clearly.",
                        "- Make the first seconds immediately compelling.",
                        "Extension prompt rules:",
                        f"- Return exactly {expected_extension_count} extension prompts.",
                        "- Every extension prompt must continue directly from the previous finished frame.",
                        "- Explicitly preserve subject continuity, camera direction, lighting logic, palette, motion continuity, and scene intent.",
                        "- Do not reset the scene, introduce abrupt cuts, or jump to unrelated compositions.",
                        "Avoid list rules:",
                        "- Include the user's avoid items plus any continuity hazards you think matter.",
                    ]
                ),
            },
        ],
        text_format=PromptPlan,
    )

    prompt_plan = response.output_parsed
    if prompt_plan is None:
        raise RuntimeError("Prompt planner returned an empty result.")

    if len(prompt_plan.extensionPrompts) != expected_extension_count:
        prompt_plan = _repair_prompt_plan(
            client=client,
            planner_model=planner["model"],
            reasoning_effort=planner["reasoning_effort"],
            original_plan=prompt_plan,
            expected_extension_count=expected_extension_count,
            execution_plan=execution_plan,
        )

    prompt_plan = _coerce_prompt_plan_extension_count(prompt_plan, expected_extension_count)
    if len(prompt_plan.extensionPrompts) != expected_extension_count:
        raise RuntimeError(
            f"Prompt planner returned {len(prompt_plan.extensionPrompts)} extension prompts "
            f"for a {len(execution_plan)}-segment execution plan."
        )

    return {
        "masterPrompt": prompt_plan.masterPrompt,
        "segmentPrompts": [prompt_plan.initialPrompt, *prompt_plan.extensionPrompts],
        "promptPlan": prompt_plan.model_dump(mode="json"),
    }


def _build_reference_input(reference_assets: list[dict[str, str]] | None) -> dict[str, str] | None:
    if not reference_assets:
        return None
    reference_url = str(reference_assets[0].get("url", "")).strip()
    return {"image_url": reference_url} if reference_url else None


def _create_initial_video(
    *,
    client: OpenAI,
    prompt: str,
    model: str,
    format_id: str,
    duration_seconds: int,
    reference_input: dict[str, str] | None,
):
    request: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "size": format_id,
        "seconds": str(_nearest_duration(duration_seconds, INITIAL_SEGMENT_SECONDS)),
    }
    if reference_input is not None:
        request["input_reference"] = reference_input
    return client.videos.create(**request)


def _extend_video(*, client: OpenAI, video_id: str, prompt: str, duration_seconds: int):
    return client.videos.extend(
        video={"id": video_id},
        prompt=prompt,
        seconds=str(_nearest_duration(duration_seconds, EXTENSION_SEGMENT_SECONDS)),
    )


def _video_actual_duration_seconds(video: Any) -> int:
    return int(str(video.seconds))


def _video_provider_metadata(video: Any, *, segment_kind: str, source_video_id: str | None) -> dict[str, object]:
    error_payload = None
    if getattr(video, "error", None):
        error_payload = {
            "code": getattr(video.error, "code", None),
            "message": getattr(video.error, "message", None),
        }

    return {
        "model": getattr(video, "model", None),
        "createdAt": getattr(video, "created_at", None),
        "completedAt": getattr(video, "completed_at", None),
        "expiresAt": getattr(video, "expires_at", None),
        "progress": getattr(video, "progress", 0),
        "size": getattr(video, "size", None),
        "rawStatus": getattr(video, "status", None),
        "remixedFromVideoId": getattr(video, "remixed_from_video_id", None),
        "error": error_payload,
        "segmentKind": segment_kind,
        "sourceVideoId": source_video_id,
    }


def _download_video(*, client: OpenAI, provider_job_id: str, output_path: str) -> dict[str, object]:
    response = client.videos.download_content(provider_job_id, variant="video")
    buffer = response.content
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_bytes(buffer)
    return {
        "localPath": str(output_file),
        "mimeType": response.response.headers.get("content-type", "video/mp4"),
        "byteSize": len(buffer),
        "checksum": hashlib.sha256(buffer).hexdigest(),
    }


def _format_sora_error(error: Exception, stage: str) -> dict[str, object]:
    if isinstance(error, APIError):
        return {
            "message": str(error),
            "code": getattr(error, "code", None) or "sora_request_failed",
            "type": error.__class__.__name__,
            "stage": stage,
            "statusCode": getattr(error, "status_code", None),
        }
    return {"message": str(error), "code": "sora_request_failed", "type": error.__class__.__name__, "stage": stage}


def clip_generation_node(state: WorkflowState) -> WorkflowState:
    settings = load_settings()
    client = _get_openai_client(settings)
    poll_interval_ms = int(os.environ.get("SORA_DEFAULT_POLL_INTERVAL_MS", str(settings.poll_interval_ms)))
    poll_timeout_ms = int(os.environ.get("SORA_DEFAULT_POLL_TIMEOUT_MS", str(DEFAULT_POLL_TIMEOUT_MS)))
    project_config = state["project_config"]
    prompts_by_scene = {prompt["scene_id"]: prompt for prompt in state["prompt_versions"]}

    clip_requests: list[dict[str, object]] = []
    missing_prompt_scenes: list[int] = []
    completed_generation_summaries: list[dict[str, object]] = []
    total_segments_rendered = 0

    for scene in state["scenes"]:
        prompt = prompts_by_scene.get(scene["scene_id"])
        if not prompt:
            missing_prompt_scenes.append(int(scene["ordinal"]))
            continue

        compiled_prompt = str(prompt["compiled_prompt"])
        aspect_ratio = str(scene["aspect_ratio"])
        requested_duration_seconds = int(scene["duration_seconds"])
        platform_preset = _platform_preset_for_aspect_ratio(aspect_ratio)
        style = _style_for_tone(project_config.get("tone"))
        model = _resolve_generation_model(prompt, settings)
        format_id = _format_for_model_and_aspect_ratio(model, aspect_ratio)
        reference_assets = _build_reference_assets(state, prompt)
        generation_mode = str(prompt.get("generation_mode", "i2v" if reference_assets else "t2v"))

        duration_resolution = _resolve_duration_plan(
            prompt_text=compiled_prompt,
            requested_duration_seconds=requested_duration_seconds,
            platform_preset=platform_preset,
            style=style,
        )
        execution_plan = [int(seconds) for seconds in duration_resolution["segmentPlan"]["segments"]]
        prompt_plan_details = _plan_segment_prompts(
            client=client,
            prompt_text=compiled_prompt,
            total_duration=int(duration_resolution["totalDuration"]),
            execution_plan=execution_plan,
            platform_preset=platform_preset,
            style=style,
            model=model,
            format_id=format_id,
        )
        segment_prompts = [str(segment_prompt) for segment_prompt in prompt_plan_details["segmentPrompts"]]

        clip_id = str(uuid4())
        clip_request = ClipRequest(
            clip_id=clip_id,
            scene_id=scene["scene_id"],
            prompt_id=prompt["prompt_id"],
            provider=project_config["provider"],
            prompt=compiled_prompt,
            requested_duration_seconds=requested_duration_seconds,
            aspect_ratio=aspect_ratio,
            style_preset=str(project_config.get("tone", "")) or None,
            status=JobStatus.RUNNING,
            metadata={
                "duration_recommendation": duration_resolution.get("recommendation"),
                "execution_plan": execution_plan,
                "resolved_duration_seconds": int(duration_resolution["totalDuration"]),
                "platform_preset": platform_preset,
                "format": format_id,
                "provider_model": model,
                "generation_mode": generation_mode,
                "reference_assets": reference_assets or [],
                "master_prompt": prompt_plan_details["masterPrompt"],
                "prompt_plan": prompt_plan_details["promptPlan"],
                "segment_history": [],
            },
        ).model_dump(mode="json")

        source_video_id: str | None = None
        segment_history: list[dict[str, object]] = []

        for segment_index, segment_seconds in enumerate(execution_plan):
            segment_kind = "initial" if segment_index == 0 else "extension"
            segment_prompt = segment_prompts[segment_index] if segment_index < len(segment_prompts) else compiled_prompt

            try:
                if segment_kind == "initial":
                    generated_video = _create_initial_video(
                        client=client,
                        prompt=segment_prompt,
                        model=model,
                        format_id=format_id,
                        duration_seconds=segment_seconds,
                        reference_input=_build_reference_input(reference_assets),
                    )
                else:
                    if not source_video_id:
                        raise RuntimeError(f"Missing source video ID before extension segment {segment_index + 1}.")
                    generated_video = _extend_video(
                        client=client,
                        video_id=source_video_id,
                        prompt=segment_prompt,
                        duration_seconds=segment_seconds,
                    )
            except Exception as error:
                stage = "creating_initial_video" if segment_kind == "initial" else "extending_video"
                formatted = _format_sora_error(error, stage)
                raise RuntimeError(str(formatted["message"])) from error

            clip_request["segment_index"] = segment_index
            clip_request["segment_kind"] = segment_kind
            clip_request["source_video_id"] = source_video_id
            clip_request["provider_job_id"] = str(generated_video.id)
            clip_request["status"] = _provider_status_to_job_status(str(generated_video.status)).value

            segment_started_at = time.time()
            while True:
                try:
                    polled_video = client.videos.retrieve(str(clip_request["provider_job_id"]))
                except Exception as error:
                    formatted = _format_sora_error(error, "polling_segment")
                    raise RuntimeError(str(formatted["message"])) from error

                clip_request["provider_job_id"] = str(polled_video.id)
                clip_request["status"] = _provider_status_to_job_status(str(polled_video.status)).value

                if polled_video.status == "completed":
                    source_video_id = str(polled_video.id)
                    segment_history.append(
                        {
                            "segment_index": segment_index,
                            "segment_kind": segment_kind,
                            "requested_seconds": segment_seconds,
                            "actual_duration_seconds": _video_actual_duration_seconds(polled_video),
                            "provider_job_id": str(polled_video.id),
                            "source_video_id": clip_request["source_video_id"],
                            "provider_metadata": _video_provider_metadata(
                                polled_video,
                                segment_kind=segment_kind,
                                source_video_id=clip_request["source_video_id"],
                            ),
                            "prompt": segment_prompt,
                        }
                    )
                    total_segments_rendered += 1
                    break

                if polled_video.status == "failed":
                    error_message = getattr(getattr(polled_video, "error", None), "message", None)
                    raise RuntimeError(error_message or f"Clip generation failed for scene {scene['scene_id']}.")

                if (time.time() - segment_started_at) * 1000 >= poll_timeout_ms:
                    raise RuntimeError(f"Sora polling timed out for scene {scene['scene_id']} segment {segment_index + 1}.")

                time.sleep(poll_interval_ms / 1000)

        if not source_video_id:
            raise RuntimeError(f"No completed Sora video was produced for scene {scene['scene_id']}.")

        try:
            downloaded_asset = _download_video(
                client=client,
                provider_job_id=source_video_id,
                output_path=str(_download_target_path(state, clip_id)),
            )
        except Exception as error:
            formatted = _format_sora_error(error, "downloading")
            raise RuntimeError(str(formatted["message"])) from error

        clip_request["provider_job_id"] = source_video_id
        clip_request["status"] = JobStatus.COMPLETED.value
        clip_request["actual_duration_seconds"] = int(segment_history[-1]["actual_duration_seconds"])
        clip_request["error_message"] = None
        clip_request["metadata"] = {
            **clip_request.get("metadata", {}),
            "segment_history": segment_history,
            "downloaded_asset": downloaded_asset,
            "local_video_path": downloaded_asset.get("localPath"),
            "local_video_bytes": downloaded_asset.get("byteSize"),
            "local_video_checksum": downloaded_asset.get("checksum"),
            "local_video_mime_type": downloaded_asset.get("mimeType"),
            "final_openai_video_id": source_video_id,
        }

        clip_requests.append(clip_request)
        completed_generation_summaries.append(
            {
                "clip_id": clip_id,
                "scene_id": scene["scene_id"],
                "provider_model": model,
                "resolved_duration_seconds": int(duration_resolution["totalDuration"]),
                "segment_count": len(execution_plan),
                "final_video_id": source_video_id,
            }
        )
        logger.info(
            "node.clip_generation | clip=%s scene=%s segments=%d model=%s video_id=%s",
            clip_id,
            scene["scene_id"],
            len(execution_plan),
            model,
            source_video_id,
        )

    if missing_prompt_scenes:
        raise RuntimeError(
            "Clip generation is blocked because scene prompt records are missing for scene "
            f"{', '.join(str(scene) for scene in missing_prompt_scenes)}."
        )

    return {
        "current_stage": WorkflowStage.CLIP_GENERATION.value,
        "clip_requests": clip_requests,
        "stage_attempts": append_stage_attempt(state, WorkflowStage.CLIP_GENERATION, JobStatus.COMPLETED),
        "audit_log": append_audit_event(
            state,
            action="clips.generated",
            entity_type="clip",
            stage=WorkflowStage.CLIP_GENERATION,
            metadata={
                "clip_count": len(clip_requests),
                "provider": project_config["provider"],
                "segment_count": total_segments_rendered,
                "generations": completed_generation_summaries,
            },
        ),
    }
