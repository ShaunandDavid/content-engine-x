from __future__ import annotations

import logging
from uuid import uuid4

from ..ai_caller import call_ai
from ..models import JobStatus, SceneDraft, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt
from ..viral_mechanics import build_framework_injection, select_framework

logger = logging.getLogger(__name__)


def _scene_durations(total_duration_seconds: int) -> list[int]:
    if total_duration_seconds == 15:
        return [5, 5, 5]
    if total_duration_seconds == 20:
        return [5, 5, 5, 5]
    return [7, 8, 7, 8]


SCENE_SYSTEM_PROMPT = """You are an expert short-form video scriptwriter who creates scenes optimized for maximum engagement and virality.

Given a video concept and scene count, generate a scene-by-scene breakdown.

Respond ONLY with a JSON object containing a "scenes" array. Each scene object must have:
{
  "scenes": [
    {
      "title": "Short scene title (2-4 words)",
      "visual_beat": "Describe the visual action, camera movement, and on-screen elements (1-2 sentences)",
      "narration": "The exact voiceover script for this scene (1-3 sentences)"
    }
  ]
}

CRITICAL RULES for narration:
- Scene 1 narration MUST be a pattern interrupt or curiosity gap hook (question, bold claim, or "wait until you see...")
- Every scene MUST include at least one engagement trigger: a question, a contrast, a specific number/stat, or a "here's what most people get wrong" framing
- The final scene MUST contain a clear payoff that delivers on the hook's promise AND a specific CTA
- Use short punchy sentences. No filler words. Every sentence must earn its place.
- Include rehook phrases between scenes: "but here's the thing...", "and it gets better...", "what nobody tells you is..."
- Use specific numbers and details, not vague claims

CRITICAL RULES for visual_beat:
- Describe what the VIEWER SEES, not abstract concepts
- Include motion direction (zoom in, pan left, cut to, overlay appears)
- Reference the tone and style from the concept
"""


def scene_planning_node(state: WorkflowState) -> WorkflowState:
    project_config = state["project_config"]
    concept = state["concept"]
    durations = _scene_durations(int(project_config["duration_seconds"]))
    aspect_ratio = project_config.get("aspect_ratio", "9:16")
    scene_count = len(durations)

    # Select viral framework and inject into system prompt
    framework_key = select_framework(concept, state.get("trend_data"))
    framework_injection = build_framework_injection(framework_key)
    scene_system_prompt = SCENE_SYSTEM_PROMPT + f"\n\n{framework_injection}\n"

    # Inject brand context into system prompt
    brand_block = state.get("brand_context_block", "")
    if brand_block:
        scene_system_prompt += f"\n\n{brand_block}\n"
        scene_system_prompt += "\nEvery scene must visually and tonally match this brand identity.\n"

    revision_count = state.get("script_revision_count", 0)
    revision_notes = state.get("script_revision_notes", "")
    revision_context = ""
    if revision_count > 0 and revision_notes:
        prev_score = state.get("script_score", {}).get("overall_score", 0)
        revision_context = (
            f"\n\nREVISION #{revision_count}: Previous script scored {prev_score}/100. "
            f"Fix these specific issues:\n{revision_notes}"
        )

    user_prompt = (
        f"Video concept:\n"
        f"  Title: {concept.get('title', '')}\n"
        f"  Hook: {concept.get('hook', '')}\n"
        f"  Thesis: {concept.get('thesis', '')}\n"
        f"  Visual direction: {concept.get('visual_direction', '')}\n"
        f"  CTA: {concept.get('cta', '')}\n\n"
        f"Generate exactly {scene_count} scenes.\n"
        f"Tone: {project_config.get('tone', 'authority')}\n"
        f"Platforms: {', '.join(project_config.get('platforms', ['tiktok']))}\n"
        f"Total duration: {project_config.get('duration_seconds', 15)} seconds"
        f"{revision_context}"
    )

    ai_generated = True
    try:
        result = call_ai(
            system_prompt=scene_system_prompt,
            user_prompt=user_prompt,
            temperature=0.8 if revision_count == 0 else 0.9,
            max_tokens=1500,
            required_keys=["scenes"],
        )

        ai_scenes = result["scenes"]
        if not isinstance(ai_scenes, list) or len(ai_scenes) < scene_count:
            raise ValueError(
                f"Expected {scene_count} scenes, got "
                f"{len(ai_scenes) if isinstance(ai_scenes, list) else 0}"
            )

        scenes = [
            SceneDraft(
                scene_id=str(uuid4()),
                ordinal=index + 1,
                title=ai_scene.get("title", f"Scene {index + 1}"),
                visual_beat=ai_scene.get("visual_beat", ""),
                narration=ai_scene.get("narration", ""),
                duration_seconds=duration,
                aspect_ratio=aspect_ratio,
            ).model_dump(mode="json")
            for index, (ai_scene, duration) in enumerate(zip(ai_scenes[:scene_count], durations))
        ]

        logger.info(
            "node.%s | ai_generated=True | scenes=%d | revision=%d",
            WorkflowStage.SCENE_PLANNING.value,
            len(scenes),
            revision_count,
        )

    except Exception as exc:
        logger.warning("AI scene planning failed, using fallback: %s", exc)
        ai_generated = False
        scenes = [
            SceneDraft(
                scene_id=str(uuid4()),
                ordinal=index + 1,
                title=f"Scene {index + 1}",
                visual_beat=f"{concept['visual_direction']} Beat {index + 1} focuses on {concept['thesis']}.",
                narration=(
                    concept["hook"]
                    if index == 0
                    else f"Support the thesis with proof point {index + 1} and maintain urgency."
                ),
                duration_seconds=duration,
                aspect_ratio=aspect_ratio,
            ).model_dump(mode="json")
            for index, duration in enumerate(durations)
        ]

    return {
        "current_stage": WorkflowStage.SCENE_PLANNING.value,
        "scenes": scenes,
        "viral_framework": framework_key,
        "stage_attempts": append_stage_attempt(state, WorkflowStage.SCENE_PLANNING, JobStatus.COMPLETED),
        "audit_log": append_audit_event(
            state,
            action="scenes.planned",
            entity_type="scene",
            stage=WorkflowStage.SCENE_PLANNING,
            metadata={"scene_count": len(scenes), "ai_generated": ai_generated, "revision": revision_count, "viral_framework": framework_key},
        ),
    }
