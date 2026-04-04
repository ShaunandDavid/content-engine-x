import Link from "next/link";

import { AdamTopNav } from "../../components/adam/adam-top-nav";
import { dashboardRoute } from "../../lib/routes";
import { runLiveRuntimePreflight } from "../../lib/server/live-runtime-preflight";
import { isPythonOrchestratorEnabled } from "../../lib/server/python-orchestrator";

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
    title: "Assembly",
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
      heading: "Adam voice path",
      status: "Server audio ready",
      copy: "ElevenLabs is configured with a selected voice, so Adam can return server-rendered audio instead of only browser playback."
    };
  }

  if (hasVoiceId) {
    return {
      heading: "Adam voice path",
      status: "Voice selected",
      copy: "A voice is selected for Adam, but server audio is still gated by the current runtime key configuration."
    };
  }

  return {
    heading: "Adam voice path",
    status: "Browser fallback",
    copy: "Adam can still speak through browser synthesis, but no server-side ElevenLabs voice is active in this runtime."
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

  const systemSignals = [
    {
      heading: "Adam provider",
      status: process.env.ADAM_PROVIDER?.trim() ? "Configured" : "Default route",
      copy: process.env.ADAM_PROVIDER?.trim()
        ? `Adam is set to ${process.env.ADAM_PROVIDER}.`
        : "Adam will fall back to the default provider path exposed by the server runtime."
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
      <AdamTopNav currentRoute="systems" />
      <div className="systems-page__body">
        <section className="systems-hero">
          <div className="systems-hero__copy">
            <p className="systems-eyebrow">Systems Control Surface</p>
            <h1>Keep the runtime legible before the workflow moves.</h1>
            <p className="systems-hero__lede">
              This page now reflects the same live readiness checks the server uses for project creation and operational
              health. It is no longer a construction placeholder.
            </p>
            <div className="systems-chip-row">
              <span className={`systems-chip systems-chip--${systemTone}`}>{runtimeStateLabel}</span>
              <span className="systems-chip">{checks.length} live checks</span>
              <span className="systems-chip">{warnings.length} warnings</span>
            </div>
          </div>

          <aside className={`systems-hero__status systems-hero__status--${systemTone}`}>
            <p className="systems-panel-label">Runtime posture</p>
            <h2>{blockingIssues.length > 0 ? "Resolve the blocking path before you trust downstream automation." : "Core systems are coherent enough to move through the live flow."}</h2>
            <p>
              {blockingIssues.length > 0
                ? blockingIssues[0]
                : "The current environment has the minimum surface needed for live project state, operator resolution, and downstream pipeline visibility."}
            </p>
            <div className="systems-hero__actions">
              <Link href={dashboardRoute} className="button button--solid" prefetch={false}>
                Open Console
              </Link>
              <Link href="/projects/new" className="button button--outline" prefetch={false}>
                Start Project
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
                  <h2>Dependency checks</h2>
                </div>
                <p className="systems-panel-note">Evaluated at request time from the active server env.</p>
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
                  <h2>Operational sequence</h2>
                </div>
                <p className="systems-panel-note">Spline-usable now as premium stacked cards, later as a scene bridge if needed.</p>
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
                  <h2>Adam and orchestration</h2>
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
                  <p className="systems-panel-label">Operator guidance</p>
                  <h2>Current blockers and warnings</h2>
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
                  <p className="systems-panel-label">Working routes</p>
                  <h2>Use the live product path</h2>
                </div>
              </div>

              <div className="systems-route-list">
                <Link href="/" className="systems-route-card" prefetch={false}>
                  <span className="systems-route-card__label">Adam</span>
                  <strong>Voice runtime surface</strong>
                  <p>Talk to Adam through the current branch runtime and server pipeline.</p>
                </Link>
                <Link href="/projects/new" className="systems-route-card" prefetch={false}>
                  <span className="systems-route-card__label">Projects</span>
                  <strong>Project creation</strong>
                  <p>Open the intake surface that uses the same operator and database readiness checks.</p>
                </Link>
                <Link href={dashboardRoute} className="systems-route-card" prefetch={false}>
                  <span className="systems-route-card__label">Console</span>
                  <strong>Operational dashboard</strong>
                  <p>Review live projects, queue state, and audit activity in the same runtime session.</p>
                </Link>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
