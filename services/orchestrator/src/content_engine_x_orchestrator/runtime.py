from __future__ import annotations

from pprint import pprint
from typing import Any
from uuid import uuid4

from .graph import build_workflow
from .models import JobStatus, WorkflowStage
from .state import WorkflowState


def create_initial_state(
    *,
    project_id: str,
    workflow_run_id: str | None = None,
    brief: dict[str, Any],
    project_config: dict[str, Any],
    metadata: dict[str, Any] | None = None,
    requested_start_stage: WorkflowStage = WorkflowStage.BRIEF_INTAKE,
) -> WorkflowState:
    return WorkflowState(
        project_id=project_id,
        workflow_run_id=workflow_run_id or str(uuid4()),
        requested_start_stage=requested_start_stage.value,
        current_stage=requested_start_stage.value,
        status=JobStatus.PENDING.value,
        brief=brief,
        project_config=project_config,
        concept={},
        scenes=[],
        prompt_versions=[],
        clip_requests=[],
        approvals=[],
        stage_attempts=[],
        audit_log=[],
        render_plan={},
        publish_payload={},
        errors=[],
        metadata=metadata or {},
    )


def invoke_workflow(state: WorkflowState, *, checkpointer: Any | None = None) -> WorkflowState:
    workflow = build_workflow(checkpointer=checkpointer)
    return workflow.invoke(state)


def main() -> None:
    sample_state = create_initial_state(
        project_id=str(uuid4()),
        brief={
            "title": "AI video ops",
            "objective": "Increase pipeline velocity",
            "audience": "content operators",
            "raw_brief": "Explain how AI-assisted video pipelines reduce turnaround time without sacrificing review controls.",
        },
        project_config={
            "project_name": "Content Engine Launch",
            "tone": "authority",
            "platforms": ["tiktok", "instagram_reels"],
            "duration_seconds": 20,
            "aspect_ratio": "9:16",
            "provider": "sora",
        },
        metadata={"auto_approve": True},
    )
    result = invoke_workflow(sample_state)
    pprint(result)


if __name__ == "__main__":
    main()
