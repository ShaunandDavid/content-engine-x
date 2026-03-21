from __future__ import annotations

from pydantic import BaseModel, Field

from .adam_contracts import (
    AdamArtifact,
    AdamGovernanceDecision,
    AdamModelDecision,
    AdamRun,
    ApprovalStatus,
    JobStatus,
    StageAttempt,
    WorkflowStage,
)


class AuditEvent(BaseModel):
    action: str
    entity_type: str
    entity_id: str | None = None
    stage: WorkflowStage | None = None
    actor_type: str = "system"
    created_at: str
    metadata: dict[str, object] = Field(default_factory=dict)
    error_message: str | None = None


class ApprovalCheckpoint(BaseModel):
    stage: WorkflowStage
    status: ApprovalStatus
    requested_at: str
    requested_by: str
    resolved_at: str | None = None
    resolved_by: str | None = None
    notes: str | None = None


class SceneDraft(BaseModel):
    scene_id: str
    ordinal: int
    title: str
    visual_beat: str
    narration: str
    duration_seconds: int
    aspect_ratio: str


class PromptVersion(BaseModel):
    prompt_id: str
    scene_id: str
    stage: WorkflowStage
    version: int
    provider: str
    model: str
    system_prompt: str
    user_prompt: str
    compiled_prompt: str
    created_at: str


class ClipRequest(BaseModel):
    clip_id: str
    scene_id: str
    prompt_id: str
    provider: str
    prompt: str
    requested_duration_seconds: int
    aspect_ratio: str
    style_preset: str | None = None
    status: JobStatus = JobStatus.PENDING
    provider_job_id: str | None = None


class RenderPlan(BaseModel):
    render_id: str
    clip_ids: list[str]
    aspect_ratio: str
    include_captions: bool = True
    include_logo: bool = True
    include_end_card: bool = True
    include_music_bed: bool = True
    operations: list[str] = Field(default_factory=list)


class PublishPayload(BaseModel):
    project_id: str
    render_id: str
    title: str
    caption: str
    hashtags: list[str]
    platforms: list[str]
    asset_urls: list[str]
    scheduled_publish_time: str | None = None
    metadata: dict[str, object] = Field(default_factory=dict)


__all__ = [
    "AdamArtifact",
    "AdamGovernanceDecision",
    "AdamModelDecision",
    "AdamRun",
    "ApprovalCheckpoint",
    "ApprovalStatus",
    "AuditEvent",
    "ClipRequest",
    "JobStatus",
    "PromptVersion",
    "PublishPayload",
    "RenderPlan",
    "SceneDraft",
    "StageAttempt",
    "WorkflowStage",
]
