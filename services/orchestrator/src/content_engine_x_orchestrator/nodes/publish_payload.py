from __future__ import annotations

from ..models import JobStatus, PublishPayload, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt


def publish_payload_node(state: WorkflowState) -> WorkflowState:
    brief = state["brief"]
    project_config = state["project_config"]
    render_plan = state["render_plan"]
    hook = state["concept"]["hook"]

    payload = PublishPayload(
        project_id=state["project_id"],
        render_id=render_plan["render_id"],
        title=brief.get("title") or hook[:60],
        caption=f"{hook} {state['concept']['cta']}",
        hashtags=["#contentenginex", "#shortformvideo", "#aicreative"],
        platforms=project_config["platforms"],
        asset_urls=[],
        metadata={
            "provider": project_config["provider"],
            "tone": project_config["tone"],
            "aspect_ratio": project_config["aspect_ratio"],
        },
    ).model_dump(mode="json")

    return {
        "current_stage": WorkflowStage.PUBLISH_PAYLOAD.value,
        "status": JobStatus.COMPLETED.value,
        "publish_payload": payload,
        "stage_attempts": append_stage_attempt(state, WorkflowStage.PUBLISH_PAYLOAD, JobStatus.COMPLETED),
        "audit_log": append_audit_event(
            state,
            action="publish.payload_created",
            entity_type="publish_job",
            stage=WorkflowStage.PUBLISH_PAYLOAD,
            metadata={"platform_count": len(payload["platforms"])},
        ),
    }
