from __future__ import annotations

from uuid import uuid4

from ..config import load_settings
from ..models import JobStatus, PromptVersion, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt, utc_now


def prompt_creation_node(state: WorkflowState) -> WorkflowState:
    settings = load_settings()
    project_config = state["project_config"]
    concept = state["concept"]

    prompt_versions = []
    for scene in state["scenes"]:
        system_prompt = (
            "You are generating a short-form vertical video shot plan. "
            "Keep outputs cinematic, legible, and optimized for social watch retention."
        )
        user_prompt = (
            f"Create a {scene['duration_seconds']} second scene in aspect ratio {scene['aspect_ratio']}. "
            f"Scene title: {scene['title']}. Visual beat: {scene['visual_beat']}. "
            f"Narration intent: {scene['narration']}. Tone: {project_config['tone']}."
        )
        compiled_prompt = (
            f"{user_prompt} Use this campaign concept as the anchor: {concept['thesis']} "
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
                system_prompt=system_prompt,
                user_prompt=user_prompt,
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
            metadata={"prompt_count": len(prompt_versions)},
        ),
    }
