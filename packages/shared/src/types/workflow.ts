import type {
  ApprovalStatus,
  AspectRatio,
  AssetRecord,
  AuditLogRecord,
  BriefRecord,
  ClipRecord,
  Platform,
  ProjectRecord,
  ProjectTone,
  PromptRecord,
  ProviderName,
  SceneRecord,
  WorkflowRunRecord,
  WorkflowStage
} from "./core.js";
import type { EnochGovernanceDecision, EnochLangGraphRuntimeState, EnochModelDecision, EnochStageHistoryEntry } from "./enoch.js";

export type StageExecution = EnochStageHistoryEntry;

// Compatibility adapter over canonical governance-decision semantics for the
// current approval-oriented workflow surfaces.
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
  clips: ClipRecord[];
  assets: AssetRecord[];
  workflowRun: WorkflowRunRecord | null;
  auditLogs: AuditLogRecord[];
}

export interface CreateProjectWorkflowResult extends ProjectWorkspace {
  brief: BriefRecord;
  workflowRun: WorkflowRunRecord;
}

export type EnochRuntimeState = EnochLangGraphRuntimeState;
export type GovernanceDecisionRecord = EnochGovernanceDecision;
export type ModelDecisionRecord = EnochModelDecision;
