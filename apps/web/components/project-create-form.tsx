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

export const ProjectCreateForm = () => {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(parsed.data)
      });

      const result = (await response.json()) as { message?: string; project?: { id: string } };

      if (!response.ok || !result.project?.id) {
        throw new Error(result.message ?? "Failed to create project.");
      }

      startTransition(() => {
        router.push(`/projects/${result.project.id}`);
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
    <form onSubmit={onSubmit} className="page-grid">
      <section className="panel-card">
        <div className="panel-card__header">
          <h2>Brief Intake</h2>
          <p>Define the objective, audience, and source brief that will seed concept, scenes, and prompts.</p>
        </div>
        <div className="panel-card__body">
          <div className="field">
            <label htmlFor="project-name">Project name</label>
            <input
              id="project-name"
              value={form.projectName}
              onChange={(event) => setForm((current) => ({ ...current, projectName: event.target.value }))}
              placeholder="Q2 Demand Gen Shorts"
            />
          </div>
          <div className="input-grid">
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
          </div>
          <div className="field">
            <label htmlFor="brief">Content brief</label>
            <textarea
              id="brief"
              value={form.rawBrief}
              onChange={(event) => setForm((current) => ({ ...current, rawBrief: event.target.value }))}
              placeholder="Describe the hook, pain point, desired takeaway, visual references, and hard guardrails."
            />
          </div>
          <div className="field">
            <label htmlFor="guardrails">Guardrails</label>
            <textarea
              id="guardrails"
              value={form.guardrailsText}
              onChange={(event) => setForm((current) => ({ ...current, guardrailsText: event.target.value }))}
              placeholder="One per line, for example: Avoid product UI claims without proof"
            />
          </div>
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-card__header">
          <h2>Publishing Targets</h2>
          <p>Choose the release destinations and output format envelope.</p>
        </div>
        <div className="panel-card__body">
          <div className="field">
            <label>Platforms</label>
            <div className="checkbox-grid">
              {PLATFORM_OPTIONS.map((platform) => (
                <label className="checkbox-card" key={platform}>
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
          <div className="input-grid">
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
          </div>
          <div className="input-grid">
            <div className="field">
              <label htmlFor="duration">Duration</label>
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

          <div className="button-row">
            <button className="button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating Project..." : "Create Project"}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
};
