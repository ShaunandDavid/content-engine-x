from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from .adam_contracts import LangGraphRuntimeState
from .models import AuditEvent, JobStatus, StageAttempt, WorkflowStage

WorkflowState = LangGraphRuntimeState


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _normalize_audit_value(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if isinstance(value, dict):
        return {key: _normalize_audit_value(nested_value) for key, nested_value in value.items()}

    if isinstance(value, list):
        return [_normalize_audit_value(item) for item in value]

    if isinstance(value, tuple):
        return [_normalize_audit_value(item) for item in value]

    return value


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
    entity_id: Any | None = None,
    metadata: dict[str, Any] | None = None,
    error_message: str | None = None,
) -> list[dict[str, Any]]:
    event = AuditEvent(
        action=action,
        entity_type=entity_type,
        entity_id=_normalize_audit_value(entity_id),
        stage=stage,
        created_at=utc_now(),
        metadata=_normalize_audit_value(metadata or {}),
        error_message=error_message,
    )
    return [*state.get("audit_log", []), event.model_dump(mode="json")]
