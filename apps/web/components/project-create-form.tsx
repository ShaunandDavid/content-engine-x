"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState, type FormEvent } from "react";
import { dashboardRoute, projectRoute } from "../lib/routes";

import {
  ASPECT_RATIO_OPTIONS,
  PLATFORM_OPTIONS,
  PROJECT_DURATION_OPTIONS,
  PROVIDER_OPTIONS,
  TONE_OPTIONS,
  projectBriefInputSchema
} from "@content-engine/shared";

type FormState = {
  projectName: string;
  objective: string;
  audience: string;
  rawBrief: string;
  tone: (typeof TONE_OPTIONS)[number];
  platforms: string[];
  durationSeconds: (typeof PROJECT_DURATION_OPTIONS)[number];
  aspectRatio: (typeof ASPECT_RATIO_OPTIONS)[number];
  provider: (typeof PROVIDER_OPTIONS)[number];
  guardrailsText: string;
};

type ReadinessCheck = {
  name: string;
  ok: boolean;
  message: string;
};

const initialState: FormState = {
  projectName: "",
  objective: "",
  audience: "",
  rawBrief: "",
  tone: TONE_OPTIONS[1],
  platforms: [PLATFORM_OPTIONS[0]],
  durationSeconds: PROJECT_DURATION_OPTIONS[1],
  aspectRatio: ASPECT_RATIO_OPTIONS[0],
  provider: PROVIDER_OPTIONS[0],
  guardrailsText: ""
};

const DevicePreview = ({ platforms, aspectRatio }: { platforms: string[], aspectRatio: string }) => {
  const isVertical = platforms.some(p => ['TikTok', 'Instagram Reels', 'YouTube Shorts'].includes(p));
  const isTV = platforms.includes('YouTube') && !isVertical;

  let deviceClass = "device-desktop";
  let label = "16:9 Landscape Output";
  if (isVertical) {
    deviceClass = "device-phone";
    label = "9:16 Vertical Output";
  } else if (isTV) {
    deviceClass = "device-tv";
    label = "16:9 Broadcast Preview";
  }

  return (
    <div className="device-canvas-container--focal">
      <div className={`device-silhouette--platinum ${deviceClass}`}>
        <div className="device-glare" />
        {isVertical && <div className="device-notch" />}
        <div className="device-screen">
          <div className="device-content-placeholder">
            <span>{label}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ProjectCreateForm = ({ 
  initialChecks = [],
  initialBlockingIssues = [],
  warnings = [] 
}: { 
  initialChecks?: ReadinessCheck[],
  initialBlockingIssues?: string[],
  warnings?: string[] 
}) => {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(initialBlockingIssues[0] ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [blockingIssues, setBlockingIssues] = useState<string[]>(initialBlockingIssues);
  const [readinessWarnings, setReadinessWarnings] = useState<string[]>(warnings);
  const [readinessChecks, setReadinessChecks] = useState<ReadinessCheck[]>(initialChecks);
  const isBlocked = blockingIssues.length > 0;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const payload = {
      projectName: form.projectName,
      objective: form.objective,
      audience: form.audience,
      rawBrief: form.rawBrief,
      tone: form.tone,
      platforms: form.platforms,
      durationSeconds: form.durationSeconds,
      aspectRatio: form.aspectRatio,
      provider: form.provider,
      guardrails: form.guardrailsText
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean)
    };

    const parsed = projectBriefInputSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      setError(firstIssue?.message ?? "Please complete the required fields.");
      return;
    }

    if (isBlocked) {
      setError(blockingIssues.join(" "));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(parsed.data)
      });

      const result = (await response.json()) as {
        message?: string;
        project?: { id: string };
        readiness?: {
          checks?: ReadinessCheck[];
          blockingIssues?: string[];
          warnings?: string[];
        };
      };

      if (!response.ok || !result.project?.id) {
        const readinessIssues = result.readiness?.blockingIssues ?? [];
        const readinessWarnings = result.readiness?.warnings ?? [];
        const readinessChecks = result.readiness?.checks ?? [];
        if (readinessIssues.length > 0) {
          setBlockingIssues(readinessIssues);
        }
        if (readinessWarnings.length > 0) {
          setReadinessWarnings(readinessWarnings);
        }
        if (readinessChecks.length > 0) {
          setReadinessChecks(readinessChecks);
        }
        const message = readinessIssues.length > 0 ? [result.message, ...readinessIssues].filter(Boolean).join(" ") : result.message;
        throw new Error(message ?? "Failed to create project.");
      }

      const projectId = result.project.id;
      startTransition(() => {
        router.push(projectRoute(projectId));
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create project.");
      setIsSubmitting(false);
    }
  };

  const togglePlatform = (platform: string) => {
    setForm((current) => ({
      ...current,
      platforms: current.platforms.includes(platform)
        ? current.platforms.filter((value) => value !== platform)
        : [...current.platforms, platform]
    }));
  };

  const creationStatusCopy = isBlocked
    ? "Runtime checks are blocking project creation."
    : "Project Enoch is ready to open a live project from this brief.";

  return (
    <>
      <aside className="studio-sidebar-left">
        <div className="studio-side-panel">
          <div className="studio-panel-intro">
            <span className="eyebrow">Create a Project</span>
            <h1>Write the project brief once.</h1>
            <p>Project Enoch uses this brief to drive planning, voice, and downstream review.</p>
          </div>

          <form id="project-form" onSubmit={onSubmit} className="studio-form-stack">
            <div className="studio-section-heading">
              <span className="eyebrow">Project Brief</span>
              <p>Keep the brief tight. It drives planning, prompts, and review.</p>
            </div>

          {isBlocked ? (
            <div className="error-banner" style={{ borderRadius: "12px", fontSize: "0.85rem", padding: "12px" }}>
              <strong style={{ display: "block", marginBottom: "8px" }}>Project creation is blocked.</strong>
              <ul className="list-reset" style={{ display: "grid", gap: "8px", fontSize: "0.82rem" }}>
                {blockingIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="project-name">Project name</label>
            <input id="project-name" value={form.projectName} onChange={(e) => setForm((c) => ({ ...c, projectName: e.target.value }))} placeholder="Q2 Demand Gen Shorts" />
          </div>
          
          <div className="field">
            <label htmlFor="objective">Objective</label>
            <input id="objective" value={form.objective} onChange={(e) => setForm((c) => ({ ...c, objective: e.target.value }))} placeholder="Drive saves and profile visits" />
          </div>
          
          <div className="field">
            <label htmlFor="audience">Audience</label>
            <input id="audience" value={form.audience} onChange={(e) => setForm((c) => ({ ...c, audience: e.target.value }))} placeholder="SaaS operators and marketers" />
          </div>
          
          <div className="field">
            <label htmlFor="brief">Project Brief</label>
            <textarea id="brief" value={form.rawBrief} onChange={(e) => setForm((c) => ({ ...c, rawBrief: e.target.value }))} placeholder="Describe the hook, insight, visual references, and expected outcome." style={{ minHeight: "160px" }} />
          </div>

          <div className="field">
            <label htmlFor="guardrails">Guardrails</label>
            <textarea id="guardrails" value={form.guardrailsText} onChange={(e) => setForm((c) => ({ ...c, guardrailsText: e.target.value }))} placeholder="Avoid unsupported claims, legal risk, or off-brand references." style={{ minHeight: "100px" }} />
          </div>
          </form>
        </div>
      </aside>

      <div className="studio-center-hero">
        <div className="studio-preview-header">
          <p className="eyebrow">Output Preview</p>
          <h2>Set the delivery format before the first run.</h2>
          <p>The preview reflects the current platform, duration, and aspect ratio so framing decisions happen early.</p>
        </div>

        <DevicePreview platforms={form.platforms} aspectRatio={form.aspectRatio} />

        <div className="studio-truth-note">
          Preview only. Scenes, prompts, and renders appear after the project is created.
        </div>

        <div className="studio-bottom-ribbon" style={{ zIndex: 50 }}>
          <div className="studio-bottom-ribbon__note">
            <span className="eyebrow">Project Readiness</span>
            <p>{creationStatusCopy}</p>
          </div>

          <div className="studio-bottom-ribbon__actions">
            <Link href={dashboardRoute} className="button button--outline" prefetch={false}>
              Open Pipeline
            </Link>
            <button type="submit" form="project-form" className="button" disabled={isSubmitting || isBlocked}>
              {isBlocked ? "Runtime Blocked" : isSubmitting ? "Creating..." : "Create and Open Project"}
            </button>
          </div>
        </div>
      </div>

      <aside className="studio-sidebar-right">
        <div className="studio-side-panel">
          <div className="studio-section-heading">
            <span className="eyebrow">Delivery Setup</span>
            <p>Set the output container, provider, and checks before Project Enoch opens the project.</p>
          </div>

          <div className="field">
            <label>Platform Targets</label>
            <div className="tag-row" style={{ gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
              {PLATFORM_OPTIONS.map((platform) => (
                <label className={`checkbox-card ${form.platforms.includes(platform) ? 'checkbox-card--active' : ''}`} key={platform} style={{ padding: "8px 12px", fontSize: "0.85rem", width: "100%", justifyContent: "flex-start" }}>
                  <input type="checkbox" checked={form.platforms.includes(platform)} onChange={() => togglePlatform(platform)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                  <span>{platform}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="provider">Render Provider</label>
            <select id="provider" value={form.provider} onChange={(e) => setForm((c) => ({ ...c, provider: e.target.value as FormState["provider"] }))}>
              {PROVIDER_OPTIONS.map((provider) => (<option key={provider} value={provider}>{provider}</option>))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="tone">Tone</label>
            <select id="tone" value={form.tone} onChange={(e) => setForm((c) => ({ ...c, tone: e.target.value as FormState["tone"] }))}>
              {TONE_OPTIONS.map((tone) => (<option key={tone} value={tone}>{tone}</option>))}
            </select>
          </div>

          <div className="input-grid" style={{ gap: "16px", gridTemplateColumns: "1fr" }}>
            <div className="field">
              <label htmlFor="duration">Target Duration</label>
              <select id="duration" value={String(form.durationSeconds)} onChange={(e) => setForm((c) => ({ ...c, durationSeconds: Number(e.target.value) as FormState["durationSeconds"] }))}>
                {PROJECT_DURATION_OPTIONS.map((duration) => (<option key={duration} value={duration}>{duration} seconds</option>))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="aspect-ratio">Aspect ratio</label>
              <select id="aspect-ratio" value={form.aspectRatio} onChange={(e) => setForm((c) => ({ ...c, aspectRatio: e.target.value as FormState["aspectRatio"] }))}>
                {ASPECT_RATIO_OPTIONS.map((ratio) => (<option key={ratio} value={ratio}>{ratio}</option>))}
              </select>
            </div>
          </div>

          {error ? <p className="error-banner">{error}</p> : null}

          <div className="empty-state" style={{ marginTop: "8px" }}>
            <span className="eyebrow">Project Readiness</span>
            <ul className="list-reset" style={{ marginTop: "10px", display: "grid", gap: "10px", fontSize: "0.82rem" }}>
              {readinessChecks.map((check) => (
                <li key={check.name}>
                  <strong style={{ display: "block", marginBottom: "4px" }}>
                    {check.ok ? "Ready" : "Blocked"}: {check.name}
                  </strong>
                  <span>{check.message}</span>
                </li>
              ))}
              {readinessChecks.length < 1 ? <li>No readiness checks were returned for this environment.</li> : null}
            </ul>
          </div>

          {readinessWarnings.length > 0 ? (
            <div className="empty-state" style={{ marginTop: "16px" }}>
              <span className="eyebrow">Runtime Notes</span>
              <ul className="list-reset" style={{ marginTop: "8px", fontSize: "0.8rem" }}>
                {readinessWarnings.map((warning) => (<li key={warning}>{warning}</li>))}
              </ul>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
};
