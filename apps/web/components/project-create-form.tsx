"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState, type FormEvent } from "react";

import {
  ASPECT_RATIO_OPTIONS,
  PLATFORM_OPTIONS,
  PROJECT_DURATION_OPTIONS,
  PROVIDER_OPTIONS,
  TONE_OPTIONS,
  projectBriefInputSchema
} from "@content-engine/shared";

import { projectRoute } from "../lib/routes";

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

const DevicePreview = ({ aspectRatio }: { aspectRatio: string }) => {
  const isVertical = aspectRatio === "9:16";
  const deviceClass = isVertical ? "device-phone" : "device-desktop";
  const label = isVertical ? "9:16 Vertical Delivery" : "16:9 Studio Output";

  return (
    <div className="device-canvas-container--focal">
      <div className={`device-silhouette--platinum ${deviceClass}`}>
        <div className="device-glare" />
        {isVertical ? <div className="device-notch" /> : null}
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
  initialChecks?: ReadinessCheck[];
  initialBlockingIssues?: string[];
  warnings?: string[];
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
        const nextBlockingIssues = result.readiness?.blockingIssues ?? [];
        const nextWarnings = result.readiness?.warnings ?? [];
        const nextChecks = result.readiness?.checks ?? [];

        if (nextBlockingIssues.length > 0) {
          setBlockingIssues(nextBlockingIssues);
        }
        if (nextWarnings.length > 0) {
          setReadinessWarnings(nextWarnings);
        }
        if (nextChecks.length > 0) {
          setReadinessChecks(nextChecks);
        }

        const message =
          nextBlockingIssues.length > 0
            ? [result.message, ...nextBlockingIssues].filter(Boolean).join(" ")
            : result.message;
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

  return (
    <>
      <aside className="studio-sidebar-left">
        <form id="project-form" onSubmit={onSubmit} className="studio-stack">
          <div className="studio-section-heading">
            <span className="eyebrow">Project Setup</span>
            <h2>Define the brief that Adam and the production pipeline will inherit.</h2>
            <p>Everything here routes into the live project workflow. No fake preview generation happens on this page.</p>
          </div>

          {isBlocked ? (
            <div className="error-banner">
              <strong>Project creation is currently blocked.</strong>
              <ul className="list-reset" style={{ marginTop: "10px" }}>
                {blockingIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="project-name">Project name</label>
            <input
              id="project-name"
              value={form.projectName}
              onChange={(event) => setForm((current) => ({ ...current, projectName: event.target.value }))}
              placeholder="Q2 Demand Gen Shorts"
            />
          </div>

          <div className="field">
            <label htmlFor="objective">Objective</label>
            <input
              id="objective"
              value={form.objective}
              onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))}
              placeholder="Drive saves and profile visits"
            />
          </div>

          <div className="field">
            <label htmlFor="audience">Audience</label>
            <input
              id="audience"
              value={form.audience}
              onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))}
              placeholder="SaaS operators and marketers"
            />
          </div>

          <div className="field">
            <label htmlFor="brief">Content brief</label>
            <textarea
              id="brief"
              value={form.rawBrief}
              onChange={(event) => setForm((current) => ({ ...current, rawBrief: event.target.value }))}
              placeholder="Describe the hook, the operator problem, the visual direction, and what the final short should drive."
              style={{ minHeight: "180px" }}
            />
          </div>

          <div className="field">
            <label htmlFor="guardrails">Guardrails and exclusions</label>
            <textarea
              id="guardrails"
              value={form.guardrailsText}
              onChange={(event) => setForm((current) => ({ ...current, guardrailsText: event.target.value }))}
              placeholder="One per line. Example: Avoid unsupported product claims."
              style={{ minHeight: "120px" }}
            />
          </div>
        </form>
      </aside>

      <div className="studio-center-hero">
        <DevicePreview aspectRatio={form.aspectRatio} />
        <div className="studio-truth-note">
          Visual framing preview only. Scene, prompt, clip, and render outputs begin after the project is created and
          routed into the real workflow.
        </div>

        <div className="studio-bottom-ribbon">
          <div className="studio-bottom-ribbon__meta">
            <span className="truth-pill">{isBlocked ? "Creation Blocked" : "Creation Ready"}</span>
            <p>Initialize the live project record, then continue in the connected workflow pages.</p>
          </div>

          <button type="submit" form="project-form" className="button" disabled={isSubmitting || isBlocked}>
            {isBlocked ? "Creation Blocked" : isSubmitting ? "Initializing..." : "Initialize & Open Project"}
          </button>
        </div>
      </div>

      <aside className="studio-sidebar-right">
        <div className="studio-stack">
          <div className="studio-section-heading">
            <span className="eyebrow">Delivery Envelope</span>
            <h2>Choose where this project is heading.</h2>
            <p>Targets, provider, and duration stay truthful to the current runtime configuration.</p>
          </div>

          <div className="field">
            <label>Target platforms</label>
            <div className="checkbox-grid">
              {PLATFORM_OPTIONS.map((platform) => (
                <label
                  className={`checkbox-card ${form.platforms.includes(platform) ? "checkbox-card--active" : ""}`}
                  key={platform}
                >
                  <input
                    type="checkbox"
                    checked={form.platforms.includes(platform)}
                    onChange={() => togglePlatform(platform)}
                  />
                  <span>{platform}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="provider">Video provider</label>
            <select
              id="provider"
              value={form.provider}
              onChange={(event) =>
                setForm((current) => ({ ...current, provider: event.target.value as FormState["provider"] }))
              }
            >
              {PROVIDER_OPTIONS.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="tone">Tone</label>
            <select
              id="tone"
              value={form.tone}
              onChange={(event) => setForm((current) => ({ ...current, tone: event.target.value as FormState["tone"] }))}
            >
              {TONE_OPTIONS.map((tone) => (
                <option key={tone} value={tone}>
                  {tone}
                </option>
              ))}
            </select>
          </div>

          <div className="input-grid studio-input-grid">
            <div className="field">
              <label htmlFor="duration">Duration target</label>
              <select
                id="duration"
                value={String(form.durationSeconds)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    durationSeconds: Number(event.target.value) as FormState["durationSeconds"]
                  }))
                }
              >
                {PROJECT_DURATION_OPTIONS.map((duration) => (
                  <option key={duration} value={duration}>
                    {duration} seconds
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="aspect-ratio">Aspect ratio</label>
              <select
                id="aspect-ratio"
                value={form.aspectRatio}
                onChange={(event) =>
                  setForm((current) => ({ ...current, aspectRatio: event.target.value as FormState["aspectRatio"] }))
                }
              >
                {ASPECT_RATIO_OPTIONS.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? <p className="error-banner">{error}</p> : null}

          <div className="glass-note">
            <span className="eyebrow">Creation Readiness</span>
            <ul className="list-reset" style={{ marginTop: "10px" }}>
              {readinessChecks.map((check) => (
                <li key={check.name}>
                  <strong>{check.ok ? "Ready" : "Blocked"}:</strong> {check.message}
                </li>
              ))}
              {readinessChecks.length < 1 ? <li>No readiness checks were returned for this environment.</li> : null}
            </ul>
          </div>

          {readinessWarnings.length > 0 ? (
            <div className="glass-note">
              <span className="eyebrow">Warnings</span>
              <ul className="list-reset" style={{ marginTop: "10px" }}>
                {readinessWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
};
