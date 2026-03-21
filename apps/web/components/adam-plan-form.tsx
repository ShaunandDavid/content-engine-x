"use client";

import { startTransition, useState, type FormEvent } from "react";

import { FormCard } from "./form-card";
import { DashboardShell } from "./dashboard-shell";
import { adamTextPlanningInputSchema, type AdamPlanningArtifact, type AdamReasoningArtifact } from "@content-engine/shared";

type FormState = {
  projectName: string;
  idea: string;
  goal: string;
  audience: string;
  offer: string;
  constraintsText: string;
  tone: "educational" | "authority" | "energetic" | "playful" | "cinematic";
  platforms: ("tiktok" | "instagram_reels" | "youtube_shorts" | "linkedin")[];
  durationSeconds: 15 | 20 | 30;
  aspectRatio: "9:16" | "16:9";
  provider: "sora";
};

type LookupMode = "projectId" | "runId";
type PlanningResultMeta = {
  projectId: string | null;
  runId: string;
};

const initialState: FormState = {
  projectName: "",
  idea: "",
  goal: "",
  audience: "General audience",
  offer: "",
  constraintsText: "",
  tone: "authority",
  platforms: ["linkedin"],
  durationSeconds: 30,
  aspectRatio: "9:16",
  provider: "sora"
};

const PLATFORM_OPTIONS: FormState["platforms"][number][] = ["tiktok", "instagram_reels", "youtube_shorts", "linkedin"];
const TONE_OPTIONS: FormState["tone"][] = ["educational", "authority", "energetic", "playful", "cinematic"];
const DURATION_OPTIONS: FormState["durationSeconds"][] = [15, 20, 30];
const ASPECT_RATIO_OPTIONS: FormState["aspectRatio"][] = ["9:16", "16:9"];

export const AdamPlanForm = () => {
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lookupMode, setLookupMode] = useState<LookupMode>("projectId");
  const [lookupValue, setLookupValue] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  const [planningArtifact, setPlanningArtifact] = useState<AdamPlanningArtifact | null>(null);
  const [reasoningArtifact, setReasoningArtifact] = useState<AdamReasoningArtifact | null>(null);
  const [planningResultMeta, setPlanningResultMeta] = useState<PlanningResultMeta | null>(null);

  const togglePlatform = (platform: FormState["platforms"][number]) => {
    setForm((current) => ({
      ...current,
      platforms: current.platforms.includes(platform)
        ? current.platforms.filter((value) => value !== platform)
        : [...current.platforms, platform]
    }));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLookupError(null);

    const payload = {
      projectName: form.projectName,
      idea: form.idea,
      goal: form.goal.trim() || undefined,
      audience: form.audience,
      offer: form.offer.trim() || undefined,
      constraints: form.constraintsText
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
      tone: form.tone,
      platforms: form.platforms,
      durationSeconds: form.durationSeconds,
      aspectRatio: form.aspectRatio,
      provider: form.provider
    };

    const parsed = adamTextPlanningInputSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please complete the required fields.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/adam/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(parsed.data)
      });

      const result = (await response.json()) as {
        message?: string;
        project?: { id: string };
        workflowRun?: { id: string };
        reasoningArtifact?: AdamReasoningArtifact;
        planningArtifact?: AdamPlanningArtifact;
      };

      if (!response.ok || !result.planningArtifact || !result.workflowRun?.id) {
        throw new Error(result.message ?? "Failed to generate Adam planning artifact.");
      }

      const artifact = result.planningArtifact;
      const runId = result.workflowRun.id;
      startTransition(() => {
        setPlanningArtifact(artifact);
        setReasoningArtifact(result.reasoningArtifact ?? null);
        setPlanningResultMeta({
          projectId: result.project?.id ?? artifact.projectId ?? null,
          runId
        });
        setLoadedFrom("new plan");
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to generate Adam planning artifact.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onLookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLookupError(null);
    setError(null);

    const trimmedLookup = lookupValue.trim();
    if (!trimmedLookup) {
      setLookupError(`Enter a ${lookupMode === "projectId" ? "project" : "run"} ID to reopen a plan.`);
      return;
    }

    setIsLoadingExisting(true);

    try {
      const params = new URLSearchParams();
      params.set(lookupMode, trimmedLookup);

      const response = await fetch(`/api/adam/plan?${params.toString()}`, {
        method: "GET"
      });

      const result = (await response.json()) as {
        message?: string;
        projectId?: string | null;
        runId?: string;
        reasoningArtifact?: AdamReasoningArtifact;
        planningArtifact?: AdamPlanningArtifact;
      };

      if (!response.ok || !result.planningArtifact) {
        throw new Error(result.message ?? "Failed to reopen Adam planning artifact.");
      }

      const artifact = result.planningArtifact;
      startTransition(() => {
        setPlanningArtifact(artifact);
        setReasoningArtifact(result.reasoningArtifact ?? null);
        setPlanningResultMeta({
          projectId: result.projectId ?? artifact.projectId ?? null,
          runId: result.runId ?? artifact.workflowRunId
        });
        setLoadedFrom(lookupMode === "projectId" ? `project ${trimmedLookup}` : `run ${trimmedLookup}`);
      });
    } catch (lookupFailure) {
      setLookupError(lookupFailure instanceof Error ? lookupFailure.message : "Failed to reopen Adam planning artifact.");
    } finally {
      setIsLoadingExisting(false);
    }
  };

  const displayedReasoning = reasoningArtifact?.reasoning ?? planningArtifact?.reasoning ?? null;

  return (
    <DashboardShell
      title="Adam Text Planning"
      subtitle="Turn a rough text idea into a clean operator-facing planning artifact without touching the existing project flow."
      status={planningArtifact ? "completed" : isSubmitting ? "running" : "pending"}
    >
      <form onSubmit={onSubmit} className="page-grid">
        <FormCard
          title="Text Intake"
          description="Capture the idea, desired goal, audience, and constraints that Adam should normalize into a planning direction."
        >
          <div className="field">
            <label htmlFor="adam-project-name">Plan name</label>
            <input
              id="adam-project-name"
              value={form.projectName}
              onChange={(event) => setForm((current) => ({ ...current, projectName: event.target.value }))}
              placeholder="Q2 Authority Push"
            />
          </div>
          <div className="field">
            <label htmlFor="adam-idea">Idea</label>
            <textarea
              id="adam-idea"
              value={form.idea}
              onChange={(event) => setForm((current) => ({ ...current, idea: event.target.value }))}
              placeholder="Describe the rough idea Adam should convert into a planning direction for a brand or campaign operator."
            />
          </div>
          <div className="input-grid">
            <div className="field">
              <label htmlFor="adam-goal">Goal</label>
              <input
                id="adam-goal"
                value={form.goal}
                onChange={(event) => setForm((current) => ({ ...current, goal: event.target.value }))}
                placeholder="Clarify the intended operator outcome"
              />
            </div>
            <div className="field">
              <label htmlFor="adam-audience">Audience</label>
              <input
                id="adam-audience"
                value={form.audience}
                onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))}
                placeholder="Performance marketers"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="adam-offer">Offer or concept</label>
            <input
              id="adam-offer"
              value={form.offer}
              onChange={(event) => setForm((current) => ({ ...current, offer: event.target.value }))}
              placeholder="Optional: give Adam a concrete concept to anchor"
            />
          </div>
          <div className="field">
            <label htmlFor="adam-constraints">Constraints</label>
            <textarea
              id="adam-constraints"
              value={form.constraintsText}
              onChange={(event) => setForm((current) => ({ ...current, constraintsText: event.target.value }))}
              placeholder="One per line, for example: Stay brand safe"
            />
          </div>
        </FormCard>

        <FormCard
          title="Planning Envelope"
          description="Keep the payload aligned with the current production envelope while this remains a narrow text-first loop."
        >
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
              <label htmlFor="adam-tone">Tone</label>
              <select
                id="adam-tone"
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
            <div className="field">
              <label htmlFor="adam-provider">Provider</label>
              <select
                id="adam-provider"
                value={form.provider}
                onChange={(event) =>
                  setForm((current) => ({ ...current, provider: event.target.value as FormState["provider"] }))
                }
              >
                <option value="sora">sora</option>
              </select>
            </div>
          </div>
          <div className="input-grid">
            <div className="field">
              <label htmlFor="adam-duration">Duration</label>
              <select
                id="adam-duration"
                value={String(form.durationSeconds)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    durationSeconds: Number(event.target.value) as FormState["durationSeconds"]
                  }))
                }
              >
                {DURATION_OPTIONS.map((duration) => (
                  <option key={duration} value={duration}>
                    {duration} seconds
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="adam-aspect-ratio">Aspect ratio</label>
              <select
                id="adam-aspect-ratio"
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
              {isSubmitting ? "Planning..." : "Generate Adam Plan"}
            </button>
          </div>
        </FormCard>
      </form>

      <section className="panel-card" style={{ marginTop: "20px" }}>
        <div className="panel-card__header">
          <h2>Reopen Existing Plan</h2>
          <p>Load one previously generated Adam planning artifact by project ID or canonical run ID.</p>
        </div>
        <div className="panel-card__body">
          <form onSubmit={onLookup} className="input-grid">
            <div className="field">
              <label htmlFor="adam-lookup-mode">Lookup by</label>
              <select
                id="adam-lookup-mode"
                value={lookupMode}
                onChange={(event) => setLookupMode(event.target.value as LookupMode)}
              >
                <option value="projectId">Project ID</option>
                <option value="runId">Run ID</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="adam-lookup-value">{lookupMode === "projectId" ? "Project ID" : "Run ID"}</label>
              <input
                id="adam-lookup-value"
                value={lookupValue}
                onChange={(event) => setLookupValue(event.target.value)}
                placeholder={lookupMode === "projectId" ? "project UUID" : "run UUID"}
              />
            </div>
            <div className="button-row" style={{ gridColumn: "1 / -1" }}>
              <button className="button button--secondary" type="submit" disabled={isLoadingExisting}>
                {isLoadingExisting ? "Loading Plan..." : "Reopen Plan"}
              </button>
            </div>
          </form>
          {lookupError ? <p className="error-banner">{lookupError}</p> : null}
        </div>
      </section>

      <section className="panel-card" style={{ marginTop: "20px" }}>
        <div className="panel-card__header">
          <h2>Planning Artifact</h2>
          <p>{loadedFrom ? `Structured output loaded from ${loadedFrom}.` : "Structured output for a brand or campaign operator."}</p>
        </div>
        <div className="panel-card__body">
          {planningArtifact ? (
            <div className="adam-plan-grid">
              <article className="payload-card">
                <strong>Reopen IDs</strong>
                <p>
                  Project ID: <code>{planningResultMeta?.projectId ?? planningArtifact.projectId}</code>
                </p>
                <p>
                  Run ID: <code>{planningResultMeta?.runId ?? planningArtifact.workflowRunId}</code>
                </p>
              </article>
              <article className="payload-card">
                <strong>Normalized User Goal</strong>
                <p>{planningArtifact.normalizedUserGoal}</p>
              </article>
              <article className="payload-card">
                <strong>Core User Goal</strong>
                <p>{displayedReasoning?.coreUserGoal ?? planningArtifact.normalizedUserGoal}</p>
              </article>
              <article className="payload-card">
                <strong>Audience</strong>
                <p>{planningArtifact.audience}</p>
              </article>
              <article className="payload-card">
                <strong>Offer or Concept</strong>
                <p>{planningArtifact.offerOrConcept}</p>
              </article>
              <article className="payload-card">
                <strong>Recommended Angle</strong>
                <p>{planningArtifact.recommendedAngle}</p>
              </article>
              <article className="payload-card">
                <strong>Request Classification</strong>
                <p>{displayedReasoning?.requestClassification ?? "Not available"}</p>
              </article>
              <article className="payload-card">
                <strong>Constraints</strong>
                <ul className="list-reset">
                  {(displayedReasoning?.explicitConstraints ?? planningArtifact.constraints).length > 0 ? (
                    (displayedReasoning?.explicitConstraints ?? planningArtifact.constraints).map((constraint: string) => (
                      <li key={constraint}>{constraint}</li>
                    ))
                  ) : (
                    <li>No explicit constraints provided.</li>
                  )}
                </ul>
              </article>
              <article className="payload-card">
                <strong>Assumptions or Unknowns</strong>
                <ul className="list-reset">
                  {displayedReasoning && displayedReasoning.assumptionsOrUnknowns.length > 0 ? (
                    displayedReasoning.assumptionsOrUnknowns.map((item: string) => <li key={item}>{item}</li>)
                  ) : (
                    <li>No major assumptions were identified.</li>
                  )}
                </ul>
              </article>
              <article className="payload-card">
                <strong>Reasoning Summary</strong>
                <p>{displayedReasoning?.reasoningSummary ?? "Not available"}</p>
              </article>
              <article className="payload-card">
                <strong>Next-Step Planning Summary</strong>
                <p>{planningArtifact.nextStepPlanningSummary}</p>
              </article>
            </div>
          ) : (
            <div className="empty-state">
              Submit a text idea to generate the first Adam planning artifact from the new text-first loop.
            </div>
          )}
        </div>
      </section>
    </DashboardShell>
  );
};
