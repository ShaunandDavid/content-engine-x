import type { Metadata } from "next";
import Link from "next/link";

import { EnochTopNav } from "../../components/enoch/enoch-top-nav";
import { dashboardRoute } from "../../lib/routes";
import { getEnochEnvValue } from "../../lib/server/enoch-env";
import { runLiveRuntimePreflight } from "../../lib/server/live-runtime-preflight";
import { isPythonOrchestratorEnabled } from "../../lib/server/python-orchestrator";

export const metadata: Metadata = {
  title: "Runtime",
  description: "Inspect the live runtime checks behind Project Enoch, voice, and downstream delivery."
};

type SystemsSignalTone = "ready" | "attention";

const pipelinePhases = [
  {
    title: "Intake",
    summary: "Project creation, operator access, and workspace ownership are grounded in the live Supabase path."
  },
  {
    title: "Generation",
    summary: "Scene planning, provider orchestration, and prompt execution stay aligned to the current runtime configuration."
  },
  {
    title: "Render",
    summary: "Render jobs and asset persistence depend on the storage, provider, and media pipeline checks below."
  },
  {
    title: "Delivery",
    summary: "Publish handoff stays downstream of the same verified project records instead of a disconnected UI shell."
  }
] as const;

const formatCheckLabel = (value: string) =>
  value
    .split("-")
    .map((segment) => {
      if (segment === "env") {
        return "Env";
      }

      if (segment === "r2") {
        return "R2";
      }

      return `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`;
    })
    .join(" ");

const getVoiceRuntimeCopy = () => {
  const hasVoiceId = Boolean(process.env.ELEVENLABS_VOICE_ID?.trim());
  const hasServerTts = Boolean(process.env.ELEVENLABS_API_KEY?.trim());

  if (hasServerTts && hasVoiceId) {
    return {
      heading: "Enoch voice path",
      status: "Server audio ready",
      copy: "ElevenLabs is configured with a selected voice, so Enoch can return server-rendered audio instead of only browser playback."
    };
  }

  if (hasVoiceId) {
    return {
      heading: "Enoch voice path",
      status: "Voice selected",
      copy: "A voice is selected for Enoch, but server audio is still gated by the current runtime key configuration."
    };
  }

  return {
    heading: "Enoch voice path",
    status: "Browser fallback",
    copy: "Enoch can still speak through browser synthesis, but no server-side ElevenLabs voice is active in this runtime."
  };
};

export default async function SystemsPage() {
  const readiness = await runLiveRuntimePreflight().catch(() => null);
  const blockingIssues = readiness?.blockingIssues ?? [];
  const warnings = readiness?.warnings ?? [];
  const checks = readiness?.checks ?? [];
  const systemTone: SystemsSignalTone = blockingIssues.length > 0 ? "attention" : "ready";
  const runtimeStateLabel = systemTone === "ready" ? "Runtime aligned" : "Needs operator attention";
  const voiceRuntime = getVoiceRuntimeCopy();
  const pythonEnabled = isPythonOrchestratorEnabled();
  const provider = getEnochEnvValue("PROVIDER");

  const systemSignals = [
    {
      heading: "Enoch provider",
      status: provider ? "Configured" : "Default route",
      copy: provider
        ? `Enoch is set to ${provider}.`
        : "Enoch will fall back to the default provider path exposed by the server runtime."
    },
    voiceRuntime,
    {
      heading: "Planning mode",
      status: pythonEnabled ? "Async orchestrator" : "Inline server mode",
      copy: pythonEnabled
        ? "Project creation can hand off to the Python orchestrator when the supporting env vars are present."
        : "Workflow planning stays inside the current Next.js runtime until the Python orchestrator is enabled."
    }
  ];

  return (
    <main className="systems-page">
      <EnochTopNav currentRoute="systems" />
      <div className="systems-page__body">
        <section className="systems-hero">
          <div className="systems-hero__copy">
            <p className="systems-eyebrow">Runtime</p>
            <h1>Check the runtime before you run the pipeline.</h1>
            <p className="systems-hero__lede">
              Project Enoch uses these live checks for project creation, voice, and downstream execution.
            </p>
            <div className="systems-chip-row">
              <span className={`systems-chip systems-chip--${systemTone}`}>{runtimeStateLabel}</span>
              <span className="systems-chip">{checks.length} live checks</span>
              <span className="systems-chip">{warnings.length} warnings</span>
            </div>
          </div>

          <aside className={`systems-hero__status systems-hero__status--${systemTone}`}>
            <p className="systems-panel-label">Runtime Status</p>
            <h2>{blockingIssues.length > 0 ? "Resolve the blocking path before you run Project Enoch." : "Core runtime paths are ready for the live flow."}</h2>
            <p>
              {blockingIssues.length > 0
                ? blockingIssues[0]
                : "The current environment has the minimum surface needed for live project state, voice, and downstream delivery."}
            </p>
            <div className="systems-hero__actions">
              <Link href={dashboardRoute} className="button button--solid" prefetch={false}>
                Open Pipeline
              </Link>
              <Link href="/projects/new" className="button button--outline" prefetch={false}>
                Create a Project
              </Link>
            </div>
          </aside>
        </section>

        <section className="systems-grid">
          <div className="systems-column">
            <section className="systems-panel">
              <div className="systems-panel__header">
                <div>
                  <p className="systems-panel-label">Live readiness</p>
                  <h2>Runtime Checks</h2>
                </div>
                <p className="systems-panel-note">Evaluated on each request from the active server environment.</p>
              </div>

              <div className="systems-check-list">
                {checks.map((check) => (
                  <article className="systems-check" key={check.name}>
                    <div className="systems-check__copy">
                      <p className="systems-check__title">{formatCheckLabel(check.name)}</p>
                      <p className="systems-check__message">{check.message}</p>
                    </div>
                    <span className={`systems-status-pill systems-status-pill--${check.ok ? "ok" : "error"}`}>
                      {check.ok ? "Ready" : "Blocked"}
                    </span>
                  </article>
                ))}
              </div>
            </section>

            <section className="systems-panel">
              <div className="systems-panel__header">
                <div>
                  <p className="systems-panel-label">Pipeline map</p>
                  <h2>Pipeline Sequence</h2>
                </div>
                <p className="systems-panel-note">The live route order from brief to delivery.</p>
              </div>

              <div className="systems-pipeline">
                {pipelinePhases.map((phase, index) => (
                  <article className="systems-pipeline-card" key={phase.title}>
                    <span className="systems-pipeline-index">{index + 1}</span>
                    <div>
                      <h3>{phase.title}</h3>
                      <p>{phase.summary}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <div className="systems-column systems-column--side">
            <section className="systems-panel">
              <div className="systems-panel__header">
                <div>
                  <p className="systems-panel-label">Runtime modules</p>
                  <h2>Enoch Runtime</h2>
                </div>
              </div>
              <div className="systems-service-grid">
                {systemSignals.map((signal) => (
                  <article className="systems-service-card" key={signal.heading}>
                    <p className="systems-service-card__label">{signal.heading}</p>
                    <strong>{signal.status}</strong>
                    <p>{signal.copy}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="systems-panel">
              <div className="systems-panel__header">
                <div>
                  <p className="systems-panel-label">Current state</p>
                  <h2>Current Issues</h2>
                </div>
              </div>

              <div className="systems-callout-stack">
                <article className={`systems-callout ${blockingIssues.length > 0 ? "systems-callout--error" : "systems-callout--ok"}`}>
                  <p className="systems-callout__label">Blocking path</p>
                  <p>{blockingIssues.length > 0 ? blockingIssues.join(" ") : "No blocking issues are currently reported by the live runtime preflight."}</p>
                </article>

                <article className="systems-callout">
                  <p className="systems-callout__label">Warnings</p>
                  <ul className="systems-note-list">
                    {warnings.length > 0 ? warnings.map((warning) => <li key={warning}>{warning}</li>) : <li>No runtime warnings are currently reported.</li>}
                  </ul>
                </article>
              </div>
            </section>

            <section className="systems-panel">
              <div className="systems-panel__header">
                <div>
                  <p className="systems-panel-label">Live routes</p>
                  <h2>Use the live product path</h2>
                </div>
              </div>

              <div className="systems-route-list">
                <Link href="/" className="systems-route-card" prefetch={false}>
                  <span className="systems-route-card__label">Project Enoch</span>
                  <strong>Voice Console</strong>
                  <p>Talk to Enoch through the live runtime and current voice path.</p>
                </Link>
                <Link href="/projects/new" className="systems-route-card" prefetch={false}>
                  <span className="systems-route-card__label">Create a Project</span>
                  <strong>Project Brief</strong>
                  <p>Open the intake surface backed by the same runtime and database checks.</p>
                </Link>
                <Link href={dashboardRoute} className="systems-route-card" prefetch={false}>
                  <span className="systems-route-card__label">Pipeline</span>
                  <strong>Project Queue</strong>
                  <p>Review live projects, queue state, and runtime activity in one place.</p>
                </Link>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
