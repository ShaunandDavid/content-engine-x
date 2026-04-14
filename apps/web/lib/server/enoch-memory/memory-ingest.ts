import type { EnochMemoryIngestRequest, EnochMemoryIngestResponse } from "@content-engine/shared";

import { inspectEnochMemoryFilesystem } from "./filesystem";
import { evaluateLessonLoopFromIngest } from "./evaluation";
import { getEnochMemoryFeatureStatus } from "./feature-gate";
import { createDisabledMemoryResponse } from "./noop";
import { distillIngestRequestToDelta, persistDistilledMemory } from "./writeback";

export const ingestEnochMemory = async (
  input: EnochMemoryIngestRequest,
  env: NodeJS.ProcessEnv = process.env
): Promise<EnochMemoryIngestResponse> => {
  const featureStatus = getEnochMemoryFeatureStatus(env);
  if (featureStatus.status !== "ready") {
    return createDisabledMemoryResponse(featureStatus);
  }

  const delta = distillIngestRequestToDelta({
    operatorUserId: input.operatorUserId,
    businessId: input.businessId,
    sessionId: input.sessionId,
    title: input.title,
    content: input.content,
    tags: input.tags,
    metadata: input.metadata
  });

  if (!delta) {
    const filesystem = await inspectEnochMemoryFilesystem(env);
    const lessonEvaluation = await evaluateLessonLoopFromIngest(
      input,
      {
        accepted: false,
        wrote: false,
        dryRun: input.dryRun,
        status: featureStatus.status,
        reason: "No durable memory signals were detected, so nothing was written.",
        warnings: filesystem.warnings,
        notePaths: [],
        cachePaths: [],
        contradictions: [],
        preview: null,
        metadata: {
          source: "enoch_memory_ingest"
        }
      },
      env
    );

    return {
      ok: true,
      status: featureStatus.status,
      accepted: false,
      dryRun: input.dryRun,
      message: "No durable memory signals were detected, so nothing was written.",
      warnings: filesystem.warnings,
      notePath: null,
      cachePaths: [],
      preview: null,
      metadata: {
        source: "enoch_memory_ingest",
        writesPerformed: false,
        lessonLoop: lessonEvaluation
      }
    };
  }

  const result = await persistDistilledMemory(delta, { dryRun: input.dryRun, env });
  const lessonEvaluation = await evaluateLessonLoopFromIngest(input, result, env);

  return {
    ok: true,
    status: featureStatus.status,
    accepted: result.accepted,
    dryRun: input.dryRun,
    message: result.reason,
    warnings: result.warnings,
    notePath: result.notePaths[0] ?? null,
    cachePaths: result.cachePaths,
    preview: result.preview,
    metadata: {
      source: "enoch_memory_ingest",
      writesPerformed: result.wrote,
      contradictions: result.contradictions,
      lessonLoop: lessonEvaluation,
      ...result.metadata
    }
  };
};
