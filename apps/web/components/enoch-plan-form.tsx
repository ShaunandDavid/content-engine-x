"use client";

import { startTransition, useState, type FormEvent } from "react";

import { FormCard } from "./form-card";
import { DashboardShell } from "./dashboard-shell";
import { enochTextPlanningInputSchema, type EnochPlanningArtifact, type EnochReasoningArtifact } from "@content-engine/shared";

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

export const EnochPlanForm = () => {
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lookupMode, setLookupMode] = useState<LookupMode>("projectId");
  const [lookupValue, setLookupValue] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  const [planningArtifact, setPlanningArtifact] = useState<EnochPlanningArtifact | null>(null);
  const [reasoningArtifact, setReasoningArtifact] = useState<EnochReasoningArtifact | null>(null);
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

    const parsed = enochTextPlanningInputSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please complete the required fields.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/enoch/plan", {
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
        reasoningArtifact?: EnochReasoningArtifact;
        planningArtifact?: EnochPlanningArtifact;
      };

      if (!response.ok || !result.planningArtifact || !result.workflowRun?.id) {
        throw new Error(result.message ?? "Failed to generate Enoch planning artifact.");
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
      setError(submitError instanceof Error ? submitError.message : "Failed to generate Enoch planning artifact.");
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

      const response = await fetch(`/api/enoch/plan?${params.toString()}`, {
        method: "GET"
      });

      const result = (await response.json()) as {
        message?: string;
        projectId?: string | null;
        runId?: string;
        reasoningArtifact?: EnochReasoningArtifact;
        planningArtifact?: EnochPlanningArtifact;
      };

      if (!response.ok || !result.planningArtifact) {
        throw new Error(result.message ?? "Failed to reopen Enoch planning artifact.");
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
      setLookupError(lookupFailure instanceof Error ? lookupFailure.message : "Failed to reopen Enoch planning artifact.");
    } finally {
      setIsLoadingExisting(false);
    }
  };

  const displayedReasoning = reasoningArtifact?.reasoning ?? planningArtifact?.reasoning ?? null;

  return (
    <DashboardShell
      title="Enoch Planner"
      subtitle="Turn a rough brief into a clean Project Enoch planning artifact."
      status={planningArtifact ? "completed" : isSubmitting ? "running" : "pending"}
    >
      <form onSubmit={onSubmit} className="page-grid">
        <FormCard
          title="Planning Brief"
          description="Capture the idea, goal, audience, and constraints that Enoch should shape into a planning direction."
        >
          <div className="field">
            <label htmlFor="enoch-project-name">Plan name</label>
            <input
              id="enoch-project-name"
              value={form.projectName}
              onChange={(event) => setForm((current) => ({ ...current, projectName: event.target.value }))}
              placeholder="Q2 Authority Launch"
            />
          </div>
          <div className="field">
            <label htmlFor="enoch-idea">Idea</label>
            <textarea
              id="enoch-idea"
              value={form.idea}
              onChange={(event) => setForm((current) => ({ ...current, idea: event.target.value }))}
              placeholder="Describe the idea Enoch should turn into a planning direction."
            />
          </div>
          <div className="input-grid">
            <div className="field">
              <label htmlFor="enoch-goal">Goal</label>
              <input
                id="enoch-goal"
                value={form.goal}
                onChange={(event) => setForm((current) => ({ ...current, goal: event.target.value }))}
                placeholder="Clarify the intended outcome"
              />
            </div>
            <div className="field">
              <label htmlFor="enoch-audience">Audience</label>
              <input
                id="enoch-audience"
                value={form.audience}
                onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))}
                placeholder="Performance marketers"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="enoch-offer">Offer or concept</label>
            <input
              id="enoch-offer"
              value={form.offer}
              onChange={(event) => setForm((current) => ({ ...current, offer: event.target.value }))}
              placeholder="Optional: give Enoch a concrete offer or concept"
            />
          </div>
          <div className="field">
            <label htmlFor="enoch-constraints">Constraints</label>
            <textarea
              id="enoch-constraints"
              value={form.constraintsText}
              onChange={(event) => setForm((current) => ({ ...current, constraintsText: event.target.value }))}
              placeholder="One per line, for example: Stay brand safe"
            />
          </div>
        </FormCard>

        <FormCard
          title="Output Envelope"
          description="Keep the planning payload aligned with the current production envelope."
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
              <label htmlFor="enoch-tone">Tone</label>
              <select
                id="enoch-tone"
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
              <label htmlFor="enoch-provider">Provider</label>
              <select
                id="enoch-provider"
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
              <label htmlFor="enoch-duration">Duration</label>
              <select
                id="enoch-duration"
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
              <label htmlFor="enoch-aspect-ratio">Aspect ratio</label>
              <select
                id="enoch-aspect-ratio"
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
              {isSubmitting ? "Building..." : "Build Plan"}
            </button>
          </div>
        </FormCard>
      </form>

      <section className="panel-card" style={{ marginTop: "20px" }}>
        <div className="panel-card__header">
          <h2>Reopen a Plan</h2>
          <p>Load a previously generated Project Enoch planning artifact by project ID or run ID.</p>
        </div>
        <div className="panel-card__body">
          <form onSubmit={onLookup} className="input-grid">
            <div className="field">
              <label htmlFor="enoch-lookup-mode">Lookup by</label>
              <select
                id="enoch-lookup-mode"
                value={lookupMode}
                onChange={(event) => setLookupMode(event.target.value as LookupMode)}
              >
                <option value="projectId">Project ID</option>
                <option value="runId">Run ID</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="enoch-lookup-value">{lookupMode === "projectId" ? "Project ID" : "Run ID"}</label>
              <input
                id="enoch-lookup-value"
                value={lookupValue}
                onChange={(event) => setLookupValue(event.target.value)}
                placeholder={lookupMode === "projectId" ? "project UUID" : "run UUID"}
              />
            </div>
            <div className="button-row" style={{ gridColumn: "1 / -1" }}>
              <button className="button button--secondary" type="submit" disabled={isLoadingExisting}>
                {isLoadingExisting ? "Loading..." : "Reopen Plan"}
              </button>
            </div>
          </form>
          {lookupError ? <p className="error-banner">{lookupError}</p> : null}
        </div>
      </section>

      <section className="panel-card" style={{ marginTop: "20px" }}>
        <div className="panel-card__header">
          <h2>Planning Artifact</h2>
          <p>{loadedFrom ? `Loaded from ${loadedFrom}.` : "Structured Project Enoch planning output."}</p>
        </div>
        <div className="panel-card__body">
          {planningArtifact ? (
            <div className="enoch-plan-grid">
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
                <strong>Normalized Goal</strong>
                <p>{planningArtifact.normalizedUserGoal}</p>
              </article>
              <article className="payload-card">
                <strong>Core Goal</strong>
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
                <strong>Request Type</strong>
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
                <strong>Assumptions</strong>
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
                <strong>Next Step</strong>
                <p>{planningArtifact.nextStepPlanningSummary}</p>
              </article>
            </div>
          ) : (
            <div className="empty-state">
              Build a plan to see the structured Project Enoch output.
            </div>
          )}
        </div>
      </section>
    </DashboardShell>
  );
};
