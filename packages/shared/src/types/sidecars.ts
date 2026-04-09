import type { z } from "zod";

import type {
  driftDecisionWriteResponseSchema,
  driftDecisionWriteSchema,
  driftKnowledgeScopeSchema,
  driftMemoryQuerySchema,
  driftMemoryRecordSchema,
  driftRecallResponseSchema,
  openSoraReferenceAssetSchema,
  openSoraResultAssetSchema,
  openSoraVideoGenerateAcceptedSchema,
  openSoraVideoGenerateRequestSchema,
  openSoraVideoResultSchema,
  openSoraVideoStatusSchema,
  openSoraWorkerJobStatusSchema
} from "../schemas/sidecars.js";

export type DriftKnowledgeScope = z.infer<typeof driftKnowledgeScopeSchema>;
export type DriftMemoryQuery = z.infer<typeof driftMemoryQuerySchema>;
export type DriftMemoryRecord = z.infer<typeof driftMemoryRecordSchema>;
export type DriftRecallResponse = z.infer<typeof driftRecallResponseSchema>;
export type DriftDecisionWrite = z.infer<typeof driftDecisionWriteSchema>;
export type DriftDecisionWriteResponse = z.infer<typeof driftDecisionWriteResponseSchema>;

export type OpenSoraReferenceAsset = z.infer<typeof openSoraReferenceAssetSchema>;
export type OpenSoraWorkerJobStatus = z.infer<typeof openSoraWorkerJobStatusSchema>;
export type OpenSoraVideoGenerateRequest = z.infer<typeof openSoraVideoGenerateRequestSchema>;
export type OpenSoraVideoGenerateAccepted = z.infer<typeof openSoraVideoGenerateAcceptedSchema>;
export type OpenSoraVideoStatus = z.infer<typeof openSoraVideoStatusSchema>;
export type OpenSoraResultAsset = z.infer<typeof openSoraResultAssetSchema>;
export type OpenSoraVideoResult = z.infer<typeof openSoraVideoResultSchema>;
