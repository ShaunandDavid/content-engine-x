import type {
  ApprovalStatus,
  AspectRatio,
  AuditLogRecord,
  BriefRecord,
  JobStatus,
  Platform,
  ProjectRecord,
  ProjectTone,
  PromptRecord,
  ProviderName,
  SceneRecord,
  WorkflowRunRecord,
  WorkflowStage
} from "./core";

export interface StageExecution {
  stage: WorkflowStage;
  status: JobStatus;
  attempt: number;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface ApprovalCheckpoint {
  stage: WorkflowStage;
  status: ApprovalStatus;
  requestedAt: string;
  requestedBy: "system" | "user";
  resolvedAt?: string;
  resolvedBy?: string;
  notes?: string;
}

export interface PromptVersionEntry {
  sceneId?: string;
  stage: WorkflowStage;
  version: number;
  promptId: string;
  provider: ProviderName;
  model: string;
  createdAt: string;
}

export interface ScenePlanDraft {
  sceneId: string;
  ordinal: number;
  title: string;
  visualBeat: string;
  narration: string;
  durationSeconds: number;
  aspectRatio: AspectRatio;
}

export interface PublishPayload {
  projectId: string;
  renderId: string;
  title: string;
  caption: string;
  hashtags: string[];
  platforms: Platform[];
  assetUrls: string[];
  scheduledPublishTime?: string;
  metadata: Record<string, unknown>;
}

export interface ProjectBriefInput {
  projectName: string;
  objective: string;
  audience: string;
  rawBrief: string;
  tone: ProjectTone;
  platforms: Platform[];
  durationSeconds: number;
  aspectRatio: AspectRatio;
  provider: ProviderName;
  guardrails: string[];
}

export interface ProjectWorkspace {
  project: ProjectRecord;
  brief: BriefRecord | null;
  scenes: SceneRecord[];
  prompts: PromptRecord[];
  workflowRun: WorkflowRunRecord | null;
  auditLogs: AuditLogRecord[];
}

export interface CreateProjectWorkflowResult extends ProjectWorkspace {
  brief: BriefRecord;
  workflowRun: WorkflowRunRecord;
}
