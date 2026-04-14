const DEFAULT_ORCHESTRATOR_URL = "http://localhost:8000";

export type PerformanceDistillResult =
  | {
      ok: true;
      status: number;
      result: Record<string, unknown>;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

const getOrchestratorUrl = () =>
  (process.env.CONTENT_ENGINE_PYTHON_ORCHESTRATOR_URL ?? DEFAULT_ORCHESTRATOR_URL).replace(/\/$/, "");

export const triggerPerformanceDistill = async (): Promise<PerformanceDistillResult> => {
  try {
    const response = await fetch(`${getOrchestratorUrl()}/performance/distill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error:
          typeof payload === "string"
            ? payload
            : typeof payload?.error === "string"
              ? payload.error
              : "Performance distillation failed."
      };
    }

    return {
      ok: true,
      status: response.status,
      result: typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {}
    };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: `Orchestrator unreachable: ${String(error)}`
    };
  }
};
