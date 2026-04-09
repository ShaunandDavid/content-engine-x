from __future__ import annotations

import logging
import threading

from ..memory.memory_distiller import distill_run
from ..models import JobStatus, PublishPayload, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt

logger = logging.getLogger(__name__)


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
            "aspect_ratio": project_config.get("aspect_ratio", "9:16"),
        },
    ).model_dump(mode="json")

    result = {
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

    final_state = {**state, **result}

    def _background_distill() -> None:
        try:
            summary = distill_run(
                state=final_state,
                project_id=str(final_state.get("project_id", "")),
                run_id=str(final_state.get("workflow_run_id") or final_state.get("run_id") or ""),
                is_recent_project=True,
            )
            logger.info("memory_distiller: %s", summary)
        except Exception as exc:  # pragma: no cover - background safety path
            logger.warning("memory_distiller background error: %s", exc)

    threading.Thread(target=_background_distill, daemon=True).start()
    return result
