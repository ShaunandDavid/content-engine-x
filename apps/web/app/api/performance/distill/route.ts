import { NextResponse } from "next/server";

// POST /api/performance/distill — trigger the Python performance distiller
// Call this after new performance data is ingested, or on a schedule
export async function POST() {
  const orchestratorUrl = process.env.CONTENT_ENGINE_PYTHON_ORCHESTRATOR_URL ?? "http://localhost:8000";

  try {
    const response = await fetch(`${orchestratorUrl.replace(/\/$/, "")}/performance/distill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error }, { status: 502 });
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: `Orchestrator unreachable: ${String(error)}` },
      { status: 503 }
    );
  }
}
