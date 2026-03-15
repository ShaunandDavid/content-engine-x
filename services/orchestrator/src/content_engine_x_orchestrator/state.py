from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from typing_extensions import TypedDict

from .models import AuditEvent, JobStatus, StageAttempt, WorkflowStage


class WorkflowState(TypedDict, total=False):
    project_id: str
    workflow_run_id: str
    requested_start_stage: str
    current_stage: str
    status: str
    brief: dict[str, Any]
    project_config: dict[str, Any]
    concept: dict[str, Any]
    scenes: list[dict[str, Any]]
    prompt_versions: list[dict[str, Any]]
    clip_requests: list[dict[str, Any]]
    approvals: list[dict[str, Any]]
    stage_attempts: list[dict[str, Any]]
    audit_log: list[dict[str, Any]]
    render_plan: dict[str, Any]
    publish_payload: dict[str, Any]
    errors: list[str]
    metadata: dict[str, Any]


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def next_attempt(state: WorkflowState, stage: WorkflowStage) -> int:
    attempts = state.get("stage_attempts", [])
    return len([attempt for attempt in attempts if attempt["stage"] == stage.value]) + 1


def append_stage_attempt(
    state: WorkflowState,
    stage: WorkflowStage,
    status: JobStatus,
    *,
    error_message: str | None = None,
) -> list[dict[str, Any]]:
    started_at = utc_now()
    attempt = StageAttempt(
        stage=stage,
        status=status,
        attempt=next_attempt(state, stage),
        started_at=started_at,
        completed_at=started_at,
        error_message=error_message,
    )
    return [*state.get("stage_attempts", []), attempt.model_dump(mode="json")]


def append_audit_event(
    state: WorkflowState,
    *,
    action: str,
    entity_type: str,
    stage: WorkflowStage | None,
    entity_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    error_message: str | None = None,
) -> list[dict[str, Any]]:
    event = AuditEvent(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        stage=stage,
        created_at=utc_now(),
        metadata=metadata or {},
        error_message=error_message,
    )
    return [*state.get("audit_log", []), event.model_dump(mode="json")]
