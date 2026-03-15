from __future__ import annotations

from uuid import uuid4

from ..models import JobStatus, RenderPlan, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt


def render_assembly_node(state: WorkflowState) -> WorkflowState:
    project_config = state["project_config"]
    clip_ids = [clip["clip_id"] for clip in state["clip_requests"]]
    render_plan = RenderPlan(
        render_id=str(uuid4()),
        clip_ids=clip_ids,
        aspect_ratio=project_config["aspect_ratio"],
        operations=[
            "normalize_clips",
            "stitch_concat",
            "burn_captions",
            "overlay_logo",
            "insert_end_card",
            "mix_music_bed",
            "extract_thumbnail",
        ],
    ).model_dump(mode="json")

    return {
        "current_stage": WorkflowStage.RENDER_ASSEMBLY.value,
        "status": JobStatus.RUNNING.value,
        "render_plan": render_plan,
        "stage_attempts": append_stage_attempt(state, WorkflowStage.RENDER_ASSEMBLY, JobStatus.COMPLETED),
        "audit_log": append_audit_event(
            state,
            action="render.planned",
            entity_type="render",
            stage=WorkflowStage.RENDER_ASSEMBLY,
            entity_id=render_plan["render_id"],
            metadata={"clip_count": len(clip_ids)},
        ),
    }
