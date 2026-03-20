import { z } from "zod";

const pythonOrchestratorConfigSchema = z.object({
  CONTENT_ENGINE_USE_PYTHON_ORCHESTRATOR: z.enum(["true", "false"]).default("false"),
  CONTENT_ENGINE_PYTHON_ORCHESTRATOR_URL: z.string().url().optional(),
  WORKFLOW_SIGNING_SECRET: z.string().min(1).optional()
});

type PythonOrchestratorConfig = z.infer<typeof pythonOrchestratorConfigSchema>;

const getPythonOrchestratorConfig = (env: NodeJS.ProcessEnv = process.env): PythonOrchestratorConfig =>
  pythonOrchestratorConfigSchema.parse(env);

export const isPythonOrchestratorEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  getPythonOrchestratorConfig(env).CONTENT_ENGINE_USE_PYTHON_ORCHESTRATOR === "true";

export const assertPythonOrchestratorConfigured = (env: NodeJS.ProcessEnv = process.env) => {
  const config = getPythonOrchestratorConfig(env);

  if (!isPythonOrchestratorEnabled(env)) {
    return config;
  }

  if (!config.CONTENT_ENGINE_PYTHON_ORCHESTRATOR_URL) {
    throw new Error("CONTENT_ENGINE_PYTHON_ORCHESTRATOR_URL is required when CONTENT_ENGINE_USE_PYTHON_ORCHESTRATOR=true.");
  }

  return config;
};

export const triggerPythonWorkflowRun = async (input: { workflowRunId: string }) => {
  const config = assertPythonOrchestratorConfigured();

  if (!config.CONTENT_ENGINE_PYTHON_ORCHESTRATOR_URL) {
    throw new Error("Python orchestrator URL is not configured.");
  }

  const response = await fetch(`${config.CONTENT_ENGINE_PYTHON_ORCHESTRATOR_URL.replace(/\/$/, "")}/workflow-runs/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.WORKFLOW_SIGNING_SECRET ? { "X-Workflow-Signing-Secret": config.WORKFLOW_SIGNING_SECRET } : {})
    },
    body: JSON.stringify({
      workflow_run_id: input.workflowRunId
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Python orchestrator trigger failed (${response.status}): ${message || "unknown error"}`);
  }
};
