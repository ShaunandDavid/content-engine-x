from __future__ import annotations

from ..config import load_settings
from ..models import ApprovalCheckpoint, ApprovalStatus, JobStatus, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt, utc_now


def qc_decision_node(state: WorkflowState) -> WorkflowState:
    settings = load_settings()
    metadata = state.get("metadata", {})
    auto_approve = bool(metadata.get("auto_approve", not settings.default_approval_required))
    approval_status = ApprovalStatus.APPROVED if auto_approve else ApprovalStatus.PENDING
    workflow_status = JobStatus.APPROVED if auto_approve else JobStatus.AWAITING_APPROVAL

    approval = ApprovalCheckpoint(
        stage=WorkflowStage.QC_DECISION,
        status=approval_status,
        requested_at=utc_now(),
        requested_by="system",
        resolved_at=utc_now() if auto_approve else None,
        resolved_by="system" if auto_approve else None,
        notes="Automatic approval applied." if auto_approve else "Awaiting operator review before render assembly.",
    )

    return {
        "current_stage": WorkflowStage.QC_DECISION.value,
        "status": workflow_status.value,
        "approvals": [*state.get("approvals", []), approval.model_dump(mode="json")],
        "stage_attempts": append_stage_attempt(state, WorkflowStage.QC_DECISION, workflow_status),
        "audit_log": append_audit_event(
            state,
            action="qc.evaluated",
            entity_type="workflow_run",
            stage=WorkflowStage.QC_DECISION,
            entity_id=state["workflow_run_id"],
            metadata={"approval_status": approval_status.value},
        ),
    }
