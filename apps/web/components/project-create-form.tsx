"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState, type FormEvent } from "react";
import { workspaceRoute } from "../lib/routes";

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
  let label = "16:9 Desktop Display";
  if (isVertical) {
    deviceClass = "device-phone";
    label = "9:16 Vertical Output";
  } else if (isTV) {
    deviceClass = "device-tv";
    label = "16:9 Studio Monitor";
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
  initialBlockingIssues = [],
  warnings = [] 
}: { 
  initialBlockingIssues?: string[],
  warnings?: string[] 
}) => {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(initialBlockingIssues[0] ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isBlocked = initialBlockingIssues.length > 0;

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
      setError(initialBlockingIssues.join(" "));
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
        readiness?: { blockingIssues?: string[] };
      };

      if (!response.ok || !result.project?.id) {
        const readinessIssues = result.readiness?.blockingIssues ?? [];
        const message = readinessIssues.length > 0 ? [result.message, ...readinessIssues].filter(Boolean).join(" ") : result.message;
        throw new Error(message ?? "Failed to create project.");
      }

      const projectId = result.project.id;
      startTransition(() => {
        router.push(workspaceRoute);
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

  return (
    <>
      {/* Left Sidebar (Inputs) */}
      <aside className="studio-sidebar-left" style={{ width: "340px", overflowY: "auto", position: "relative", zIndex: 10 }}>
        <form id="project-form" onSubmit={onSubmit} style={{ padding: "32px 24px", display: "flex", flexDirection: "column", gap: "28px" }}>
          
          <div className="eyebrow" style={{ color: "var(--muted)", letterSpacing: "0.15em", marginBottom: "-12px", borderBottom: "1px solid rgba(0,0,0,0.06)", paddingBottom: "16px" }}>Project Setup</div>
          
          {isBlocked ? (
            <div className="error-banner" style={{ borderRadius: "12px", fontSize: "0.85rem", padding: "12px" }}>
              <strong style={{ display: "block" }}>Preflight Failing.</strong>
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
            <label htmlFor="brief">Content Brief</label>
            <textarea id="brief" value={form.rawBrief} onChange={(e) => setForm((c) => ({ ...c, rawBrief: e.target.value }))} placeholder="Describe the hook, pain point, visual references, and transitions." style={{ minHeight: "160px" }} />
          </div>

          <div className="field">
            <label htmlFor="guardrails">Guardrails & Exclusions</label>
            <textarea id="guardrails" value={form.guardrailsText} onChange={(e) => setForm((c) => ({ ...c, guardrailsText: e.target.value }))} placeholder="Avoid product UI claims..." style={{ minHeight: "100px" }} />
          </div>

        </form>
      </aside>

      {/* Center Hero Canvas */}
      <div className="studio-center-hero">
        <DevicePreview platforms={form.platforms} aspectRatio={form.aspectRatio} />

        {/* Floating Bottom Ribbon */}
        <div className="studio-bottom-ribbon" style={{ zIndex: 50 }}>
          <div style={{ display: "flex", gap: "12px" }}>
            <button type="button" className="button button--secondary" disabled style={{ opacity: 0.5, cursor: "not-allowed", border: "0", background: "transparent" }}>Save Draft</button>
            <button type="button" className="button button--secondary" disabled style={{ opacity: 0.5, cursor: "not-allowed", border: "0", background: "transparent" }}>Publish Later</button>
          </div>
          <div style={{ display: "flex", gap: "16px" }}>
            <button type="button" className="button button--secondary" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>Generate Preview</button>
            <button type="submit" form="project-form" className="button" disabled={isSubmitting || isBlocked}>
              {isBlocked ? "System Offline" : isSubmitting ? "Orchestrating..." : "Initialize & Move to Workspace"}
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar (Settings) */}
      <aside className="studio-sidebar-right" style={{ width: "340px", overflowY: "auto", position: "relative", zIndex: 10 }}>
        <div style={{ padding: "32px 24px", display: "flex", flexDirection: "column", gap: "28px" }}>
          
          <div className="eyebrow" style={{ color: "var(--muted)", letterSpacing: "0.15em", marginBottom: "-12px", borderBottom: "1px solid rgba(0,0,0,0.06)", paddingBottom: "16px" }}>Export Options</div>
          
          <div className="field">
            <label>Target Platforms</label>
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
            <label htmlFor="provider">Video Provider</label>
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
              <label htmlFor="duration">Duration Target</label>
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
          {warnings.length > 0 ? (
            <div className="empty-state" style={{ marginTop: "16px" }}>
              <span className="eyebrow">Warnings</span>
              <ul className="list-reset" style={{ marginTop: "8px", fontSize: "0.8rem" }}>
                {warnings.map((warning) => (<li key={warning}>{warning}</li>))}
              </ul>
            </div>
          ) : null}

        </div>
      </aside>
    </>
  );
};
