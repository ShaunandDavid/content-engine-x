from __future__ import annotations

from typing import Any

from .graph import build_workflow
from .models import JobStatus, WorkflowStage
from .supabase_store import (
    load_workflow_run_context,
    mark_workflow_running,
    persist_workflow_failure,
    persist_workflow_success,
)


def run_planning_workflow(workflow_run_id: str) -> None:
    context = load_workflow_run_context(workflow_run_id)
    state_snapshot = dict(context["state_snapshot"] or {})
    project_id = context["project_id"]

    state_snapshot["project_id"] = project_id
    state_snapshot["workflow_run_id"] = workflow_run_id
    state_snapshot["current_stage"] = WorkflowStage.BRIEF_INTAKE.value
    state_snapshot["status"] = JobStatus.RUNNING.value
    state_snapshot.setdefault("errors", [])
    state_snapshot.setdefault("metadata", {})
    state_snapshot["metadata"] = {
        **state_snapshot["metadata"],
        "execution_owner": "python_orchestrator",
    }

    mark_workflow_running(workflow_run_id, state_snapshot)

    try:
        workflow = build_workflow(approval_interrupts=[WorkflowStage.CLIP_GENERATION.value])
        result = workflow.invoke(state_snapshot)
        result_state: dict[str, Any] = dict(result)
        result_state["status"] = JobStatus.COMPLETED.value
        result_state["current_stage"] = result_state.get("current_stage", WorkflowStage.PROMPT_CREATION.value)
        result_state["project_id"] = project_id
        result_state["workflow_run_id"] = workflow_run_id
        persist_workflow_success(workflow_run_id, result_state)
    except Exception as error:
        current_stage = state_snapshot.get("current_stage", WorkflowStage.BRIEF_INTAKE.value)
        message = str(error)
        failed_snapshot = {
            **state_snapshot,
            "status": JobStatus.FAILED.value,
            "current_stage": current_stage,
            "errors": [*state_snapshot.get("errors", []), message],
        }
        persist_workflow_failure(
            workflow_run_id,
            project_id=project_id,
            current_stage=current_stage,
            error_message=message,
            state_snapshot=failed_snapshot,
        )
        raise
