from __future__ import annotations

from uuid import uuid4

from ..models import ClipRequest, JobStatus, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt


def clip_generation_node(state: WorkflowState) -> WorkflowState:
    project_config = state["project_config"]
    prompts_by_scene = {prompt["scene_id"]: prompt for prompt in state["prompt_versions"]}

    clip_requests = [
        ClipRequest(
            clip_id=str(uuid4()),
            scene_id=scene["scene_id"],
            prompt_id=prompts_by_scene[scene["scene_id"]]["prompt_id"],
            provider=project_config["provider"],
            prompt=prompts_by_scene[scene["scene_id"]]["compiled_prompt"],
            requested_duration_seconds=scene["duration_seconds"],
            aspect_ratio=scene["aspect_ratio"],
            style_preset=project_config["tone"],
            status=JobStatus.QUEUED,
        ).model_dump(mode="json")
        for scene in state["scenes"]
    ]

    return {
        "current_stage": WorkflowStage.CLIP_GENERATION.value,
        "clip_requests": clip_requests,
        "stage_attempts": append_stage_attempt(state, WorkflowStage.CLIP_GENERATION, JobStatus.COMPLETED),
        "audit_log": append_audit_event(
            state,
            action="clips.queued",
            entity_type="clip",
            stage=WorkflowStage.CLIP_GENERATION,
            metadata={"clip_count": len(clip_requests), "provider": project_config["provider"]},
        ),
    }
