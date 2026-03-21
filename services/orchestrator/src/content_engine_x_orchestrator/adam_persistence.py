from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from .adam_contracts import AdamArtifact, AdamGovernanceDecision, AdamModelDecision, AdamRun


@dataclass(slots=True)
class AdamRunWriteRequest:
    run: AdamRun
    state_version: str
    state_snapshot: dict[str, Any]
    project_id: str | None = None
    parent_run_id: str | None = None
    error_message: str | None = None


@dataclass(slots=True)
class AdamRunUpdateRequest:
    run_id: str
    status: str | None = None
    current_stage: str | None = None
    requested_start_stage: str | None = None
    graph_thread_id: str | None = None
    input_ref: str | None = None
    output_refs: list[str] | None = None
    state_version: str | None = None
    state_snapshot: dict[str, Any] | None = None
    error_message: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    metadata: dict[str, Any] | None = None


@dataclass(slots=True)
class AdamArtifactWriteRequest:
    artifact: AdamArtifact
    project_id: str | None = None
    storage_provider: str | None = None
    storage_bucket: str | None = None
    storage_key: str | None = None
    error_message: str | None = None


@dataclass(slots=True)
class AdamAuditEventWriteRequest:
    run_id: str
    actor_type: str
    event_type: str
    entity_type: str
    tenant_id: str | None = None
    project_id: str | None = None
    actor_id: str | None = None
    entity_id: str | None = None
    stage: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    error_message: str | None = None


@dataclass(slots=True)
class AdamModelDecisionWriteRequest:
    decision: AdamModelDecision
    project_id: str | None = None
    fallback_of: str | None = None


@dataclass(slots=True)
class AdamGovernanceDecisionWriteRequest:
    decision: AdamGovernanceDecision
    project_id: str | None = None


class AdamFastPathPersistence(Protocol):
    def create_run(self, request: AdamRunWriteRequest) -> dict[str, Any]:
        """Persist a canonical Adam run row for fast-path orchestration."""

    def update_run(self, request: AdamRunUpdateRequest) -> dict[str, Any]:
        """Update a canonical Adam run row for fast-path orchestration."""

    def create_artifact(self, request: AdamArtifactWriteRequest) -> dict[str, Any]:
        """Persist a canonical Adam artifact row for fast-path orchestration."""

    def append_audit_event(self, request: AdamAuditEventWriteRequest) -> dict[str, Any]:
        """Persist a canonical Adam audit event."""

    def create_model_decision(self, request: AdamModelDecisionWriteRequest) -> dict[str, Any]:
        """Persist a canonical Adam model decision."""

    def create_governance_decision(self, request: AdamGovernanceDecisionWriteRequest) -> dict[str, Any]:
        """Persist a canonical Adam governance decision."""
