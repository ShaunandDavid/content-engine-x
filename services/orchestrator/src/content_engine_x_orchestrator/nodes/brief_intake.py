from __future__ import annotations

from ..models import JobStatus, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt


def brief_intake_node(state: WorkflowState) -> WorkflowState:
    brief = state.get("brief", {})
    project_config = state.get("project_config", {})

    if not brief.get("raw_brief"):
        raise ValueError("brief.raw_brief is required before brief intake can run.")

    return {
        "current_stage": WorkflowStage.BRIEF_INTAKE.value,
        "status": JobStatus.RUNNING.value,
        "brief": {
            **brief,
            "validated": True,
            "objective": brief.get("objective", "").strip(),
            "audience": brief.get("audience", "").strip(),
        },
        "project_config": {
            **project_config,
            "project_name": project_config.get("project_name", "Untitled Project"),
        },
        "stage_attempts": append_stage_attempt(state, WorkflowStage.BRIEF_INTAKE, JobStatus.COMPLETED),
        "audit_log": append_audit_event(
            state,
            action="brief.validated",
            entity_type="brief",
            stage=WorkflowStage.BRIEF_INTAKE,
            metadata={"project_name": project_config.get("project_name")},
        ),
    }
