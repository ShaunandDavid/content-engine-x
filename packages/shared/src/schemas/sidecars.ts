import { z } from "zod";

const optionalMetadataSchema = z.record(z.string(), z.unknown()).optional().default({});

export const driftKnowledgeScopeSchema = z.enum([
  "codebase_conventions",
  "architecture_decisions",
  "workflow_patterns",
  "project_context",
  "implementation_notes"
]);

export const driftMemoryQuerySchema = z.object({
  namespace: z.string().min(1).default("enoch"),
  topic: z.string().min(3).max(200),
  scope: z.array(driftKnowledgeScopeSchema).min(1).default(["architecture_decisions", "workflow_patterns"]),
  projectId: z.string().uuid().optional(),
  workflowRunId: z.string().uuid().optional(),
  maxItems: z.number().int().min(1).max(20).default(5),
  metadata: optionalMetadataSchema
});

export const driftMemoryRecordSchema = z.object({
  entryId: z.string().min(1),
  namespace: z.string().min(1),
  topic: z.string().min(1),
  scope: driftKnowledgeScopeSchema,
  summary: z.string().min(1),
  source: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  metadata: optionalMetadataSchema
});

export const driftRecallResponseSchema = z.object({
  query: driftMemoryQuerySchema,
  records: z.array(driftMemoryRecordSchema),
  message: z.string().min(1),
  metadata: optionalMetadataSchema
});

export const driftDecisionWriteSchema = z.object({
  namespace: z.string().min(1).default("enoch"),
  title: z.string().min(3).max(200),
  summary: z.string().min(10).max(2000),
  details: z.string().min(10).max(10000).optional(),
  scope: driftKnowledgeScopeSchema.default("architecture_decisions"),
  tags: z.array(z.string().min(1)).default([]),
  projectId: z.string().uuid().optional(),
  workflowRunId: z.string().uuid().optional(),
  metadata: optionalMetadataSchema
});

export const driftDecisionWriteResponseSchema = z.object({
  accepted: z.boolean(),
  entryId: z.string().min(1).optional(),
  message: z.string().min(1),
  metadata: optionalMetadataSchema
});

export const openSoraReferenceAssetSchema = z
  .object({
    assetId: z.string().uuid().optional(),
    url: z.string().url().optional(),
    mimeType: z.string().min(1).optional()
  })
  .refine((value) => Boolean(value.assetId || value.url), {
    message: "Each Open-Sora reference asset needs an assetId or url."
  });

export const openSoraVideoGenerateRequestSchema = z.object({
  projectId: z.string().uuid(),
  workflowRunId: z.string().uuid().optional(),
  sceneId: z.string().uuid(),
  prompt: z.string().min(10),
  durationSeconds: z.number().int().min(4).max(30),
  aspectRatio: z.enum(["9:16", "16:9"]),
  stylePreset: z.string().min(1).optional(),
  referenceAssets: z.array(openSoraReferenceAssetSchema).optional(),
  callbackUrl: z.string().url().optional(),
  metadata: optionalMetadataSchema
});

export const openSoraWorkerJobStatusSchema = z.enum(["queued", "running", "completed", "failed"]);

export const openSoraVideoGenerateAcceptedSchema = z.object({
  accepted: z.boolean(),
  jobId: z.string().min(1),
  status: openSoraWorkerJobStatusSchema,
  message: z.string().min(1),
  metadata: optionalMetadataSchema
});

export const openSoraVideoStatusSchema = z.object({
  jobId: z.string().min(1),
  status: openSoraWorkerJobStatusSchema,
  progress: z.number().min(0).max(1).optional(),
  errorMessage: z.string().min(1).optional(),
  metadata: optionalMetadataSchema
});

export const openSoraResultAssetSchema = z.object({
  kind: z.enum(["video", "thumbnail", "log"]).default("video"),
  url: z.string().url(),
  mimeType: z.string().min(1).optional(),
  metadata: optionalMetadataSchema
});

export const openSoraVideoResultSchema = z.object({
  jobId: z.string().min(1),
  status: z.literal("completed"),
  assets: z.array(openSoraResultAssetSchema).min(1),
  metadata: optionalMetadataSchema
});
