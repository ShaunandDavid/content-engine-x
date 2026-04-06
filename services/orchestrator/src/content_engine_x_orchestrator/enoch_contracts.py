from __future__ import annotations

import json
from enum import StrEnum
from pathlib import Path
from typing import Any
from typing_extensions import TypedDict

from pydantic import BaseModel, Field


ENOCH_STATE_VERSION = "enoch.phase0.v1"
_COMPATIBILITY_CONFIG_PATH = (
    Path(__file__).resolve().parents[4] / "packages" / "shared" / "src" / "config" / "enoch-compatibility.json"
)
with _COMPATIBILITY_CONFIG_PATH.open("r", encoding="utf-8") as compatibility_config_file:
    _COMPATIBILITY_CONFIG = json.load(compatibility_config_file)

ENOCH_COMPATIBILITY_TENANT_ID = _COMPATIBILITY_CONFIG["compatibilityTenantId"]
DEFAULT_TENANT_ID = ENOCH_COMPATIBILITY_TENANT_ID
DEFAULT_WORKFLOW_KIND = "content_engine_x.fast_path"
DEFAULT_WORKFLOW_VERSION = "phase0"
DEFAULT_ENTRYPOINT = "project_workflow"


class JobStatus(StrEnum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ApprovalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class WorkflowStage(StrEnum):
    BRIEF_INTAKE = "brief_intake"
    CONCEPT_GENERATION = "concept_generation"
    SCENE_PLANNING = "scene_planning"
    PROMPT_CREATION = "prompt_creation"
    CLIP_GENERATION = "clip_generation"
    QC_DECISION = "qc_decision"
    RENDER_ASSEMBLY = "render_assembly"
    TREND_RESEARCH = "trend_research"
    SCRIPT_VALIDATION = "script_validation"
    ASSET_PERSISTENCE = "asset_persistence"
    PUBLISH_PAYLOAD = "publish_payload"


class GovernanceOutcome(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    FLAGGED = "flagged"


class ArtifactRole(StrEnum):
    INPUT = "input"
    WORKING = "working"
    OUTPUT = "output"


class StageAttempt(BaseModel):
    stage: WorkflowStage
    status: JobStatus
    attempt: int
    started_at: str
    completed_at: str | None = None
    error_message: str | None = None


class EnochRun(BaseModel):
    run_id: str
    tenant_id: str
    workflow_kind: str
    workflow_version: str
    status: JobStatus
    current_stage: WorkflowStage
    requested_start_stage: WorkflowStage | None = None
    entrypoint: str
    graph_thread_id: str | None = None
    input_ref: str | None = None
    output_refs: list[str] = Field(default_factory=list)
    started_at: str | None = None
    completed_at: str | None = None
    updated_at: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class EnochArtifact(BaseModel):
    artifact_id: str
    tenant_id: str
    run_id: str
    artifact_type: str
    artifact_role: ArtifactRole
    status: JobStatus
    schema_name: str
    schema_version: str
    content_ref: str | None = None
    content: Any | None = None
    checksum: str | None = None
    created_at: str
    updated_at: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class EnochGovernanceDecision(BaseModel):
    decision_id: str
    tenant_id: str
    run_id: str
    stage: WorkflowStage
    decision_type: str
    outcome: GovernanceOutcome
    reason_codes: list[str] = Field(default_factory=list)
    notes: str | None = None
    created_at: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class EnochModelDecision(BaseModel):
    decision_id: str
    tenant_id: str
    run_id: str
    stage: WorkflowStage
    task_type: str
    provider: str
    model: str
    selection_reason: str
    created_at: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class LangGraphRuntimeState(TypedDict, total=False):
    state_version: str
    project_id: str
    workflow_run_id: str
    run_id: str
    tenant_id: str
    workflow_kind: str
    workflow_version: str
    entrypoint: str
    status: str
    current_stage: str
    requested_start_stage: str
    graph_thread_id: str
    stage_history: list[dict[str, Any]]
    stage_attempts: list[dict[str, Any]]
    input_artifact_refs: list[str]
    output_artifact_refs: list[str]
    working_memory: dict[str, Any]
    governance_decision_refs: list[str]
    model_decision_refs: list[str]
    brief: dict[str, Any]
    project_config: dict[str, Any]
    concept: dict[str, Any]
    scenes: list[dict[str, Any]]
    prompt_versions: list[dict[str, Any]]
    clip_requests: list[dict[str, Any]]
    approvals: list[dict[str, Any]]
    audit_log: list[dict[str, Any]]
    render_plan: dict[str, Any]
    publish_payload: dict[str, Any]
    trend_briefs: list[dict[str, Any]]
    trend_source: str
    trend_niche: str
    script_score: dict[str, Any]
    script_approved: bool
    script_revision_count: int
    script_revision_notes: str
    errors: list[str]
    metadata: dict[str, Any]
