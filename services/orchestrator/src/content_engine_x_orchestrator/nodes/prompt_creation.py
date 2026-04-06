from __future__ import annotations

import logging
from uuid import uuid4

from ..ai_caller import call_ai
from ..config import load_settings
from ..models import JobStatus, PromptVersion, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt, utc_now

logger = logging.getLogger(__name__)

PROMPT_SYSTEM = """You are an expert AI video generation prompt engineer specializing in Sora and diffusion video models.

Given a scene description and video concept, write a single Sora-optimized video generation prompt.

Respond ONLY with a JSON object:
{
  "prompt": "Your cinematic Sora prompt here"
}

Rules for the prompt:
- Lead with the primary subject and action
- Include specific camera movement (slow zoom in, wide establishing shot, close-up pan, etc.)
- Specify lighting (golden hour, studio lighting, dramatic shadows, etc.)
- Include mood and color palette
- Reference the visual style and tone from the concept
- Keep it under 120 words — Sora performs best with focused prompts
- Do NOT include text overlays or captions — those are added in post
- Do NOT reference brands, logos, or copyrighted content
- Format: [Subject + Action], [Camera Movement], [Lighting], [Style/Mood], [Detail]
"""


def prompt_creation_node(state: WorkflowState) -> WorkflowState:
    settings = load_settings()
    project_config = state["project_config"]
    concept = state["concept"]

    prompt_versions = []
    for scene in state["scenes"]:
        system_prompt_text = (
            "You are generating a short-form vertical video shot plan. "
            "Keep outputs cinematic, legible, and optimized for social watch retention."
        )
        user_prompt_text = (
            f"Create a {scene['duration_seconds']} second scene in aspect ratio {scene['aspect_ratio']}. "
            f"Scene title: {scene['title']}. Visual beat: {scene['visual_beat']}. "
            f"Narration intent: {scene['narration']}. Tone: {project_config['tone']}."
        )

        ai_generated = True
        try:
            ai_user_prompt = (
                f"Scene title: {scene['title']}\n"
                f"Visual beat: {scene['visual_beat']}\n"
                f"Narration: {scene['narration']}\n"
                f"Duration: {scene['duration_seconds']} seconds\n"
                f"Aspect ratio: {scene['aspect_ratio']}\n"
                f"Tone: {project_config.get('tone', 'authority')}\n"
                f"Campaign concept: {concept.get('thesis', '')}\n"
                f"Visual direction: {concept.get('visual_direction', '')}"
            )
            result = call_ai(
                system_prompt=PROMPT_SYSTEM,
                user_prompt=ai_user_prompt,
                temperature=0.7,
                max_tokens=300,
                required_keys=["prompt"],
            )
            compiled_prompt = result["prompt"]
            logger.info(
                "node.%s | ai_generated=True | scene=%s",
                WorkflowStage.PROMPT_CREATION.value,
                scene["scene_id"][:8],
            )
        except Exception as exc:
            logger.warning("AI prompt creation failed for scene %s, using fallback: %s", scene["scene_id"][:8], exc)
            ai_generated = False
            compiled_prompt = (
                f"{user_prompt_text} Use this campaign concept as the anchor: {concept['thesis']} "
                f"Open with: {concept['hook']} End with: {concept['cta']}"
            )

        prompt_versions.append(
            PromptVersion(
                prompt_id=str(uuid4()),
                scene_id=scene["scene_id"],
                stage=WorkflowStage.PROMPT_CREATION,
                version=1,
                provider=project_config["provider"],
                model=settings.openai_sora_model,
                system_prompt=system_prompt_text,
                user_prompt=user_prompt_text,
                compiled_prompt=compiled_prompt,
                created_at=utc_now(),
            ).model_dump(mode="json")
        )

    return {
        "current_stage": WorkflowStage.PROMPT_CREATION.value,
        "prompt_versions": prompt_versions,
        "stage_attempts": append_stage_attempt(state, WorkflowStage.PROMPT_CREATION, JobStatus.COMPLETED),
        "audit_log": append_audit_event(
            state,
            action="prompts.created",
            entity_type="prompt",
            stage=WorkflowStage.PROMPT_CREATION,
            metadata={"prompt_count": len(prompt_versions), "ai_generated": ai_generated},
        ),
    }
