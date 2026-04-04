import { NextResponse } from "next/server";
import { ZodError } from "zod";

import "../../../lib/server/ensure-runtime-env";

import { appendAuditLog, createProjectWorkflow, initializeAsyncProjectWorkflow, updateProjectWorkflowState } from "@content-engine/db";
import { projectBriefInputSchema } from "@content-engine/shared";

import { assertProjectCreationReady, LiveRuntimePreflightError } from "../../../lib/server/live-runtime-preflight";
import { isPythonOrchestratorEnabled, triggerPythonWorkflowRun } from "../../../lib/server/python-orchestrator";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = projectBriefInputSchema.parse(body);

    if (isPythonOrchestratorEnabled()) {
      await assertProjectCreationReady();
      const result = await initializeAsyncProjectWorkflow(parsed);

      try {
        await triggerPythonWorkflowRun({ workflowRunId: result.workflowRun.id });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to trigger Python orchestrator.";

        await updateProjectWorkflowState({
          projectId: result.project.id,
          workflowRunId: result.workflowRun.id,
          projectStatus: "failed",
          currentStage: "brief_intake",
          workflowStatus: "failed",
          stateSnapshot: {
            ...result.workflowRun.stateSnapshot,
            status: "failed",
            current_stage: "brief_intake",
            errors: [message]
          },
          errorMessage: message
        });

        await appendAuditLog({
          projectId: result.project.id,
          workflowRunId: result.workflowRun.id,
          actorType: "service",
          action: "workflow.trigger_failed",
          entityType: "workflow_run",
          entityId: result.workflowRun.id,
          stage: "brief_intake",
          errorMessage: message,
          metadata: {
            execution_owner: "python_orchestrator"
          }
        });

        return NextResponse.json({ message }, { status: 502 });
      }

      return NextResponse.json(result, { status: 201 });
    }

    await assertProjectCreationReady();
    const result = await createProjectWorkflow(parsed);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.flatten();
      return NextResponse.json(
        {
          message: "Project brief validation failed.",
          issues
        },
        { status: 400 }
      );
    }

    if (error instanceof LiveRuntimePreflightError) {
      return NextResponse.json(
        {
          message: error.message,
          readiness: error.readiness
        },
        { status: 503 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to create project workflow.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
