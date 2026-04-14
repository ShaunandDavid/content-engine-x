"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { clipReviewRoute, publishRoute, renderRoute, sequenceRouteForProject } from "../lib/routes";
import { Button } from "./ui/button";

const STORAGE_KEY = "enoch-active-project-id";

type ProgressResponse = {
  projectId: string;
  projectName: string;
  currentStageLabel: string;
  counts: {
    scenes: number;
    approvedScenes: number;
    completedScenes: number;
    clips: number;
    completedClips: number;
    activeClips: number;
    failedClips: number;
  };
  render: {
    id: string;
    status: string;
    updatedAt: string;
    errorMessage: string | null;
  } | null;
  publish: {
    id: string;
    status: string;
    updatedAt: string;
    errorMessage: string | null;
  } | null;
  tracker: {
    progressPercent: number;
    progressMode: "determinate" | "indeterminate";
    stepLabel: string;
    detailLabel: string;
    isActive: boolean;
    isTerminal: boolean;
    hasFinalRender: boolean;
  };
};

const extractProjectIdFromPath = (pathname: string) => {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const formatTimestamp = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })
    : "Waiting";

export function ProjectProgressTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [storedProjectId, setStoredProjectId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const routeProjectId = useMemo(() => {
    const fromQuery = searchParams.get("projectId");
    if (fromQuery?.trim()) {
      return fromQuery.trim();
    }

    return extractProjectIdFromPath(pathname);
  }, [pathname, searchParams]);

  const activeProjectId = routeProjectId ?? storedProjectId;

  useEffect(() => {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) {
      setStoredProjectId(existing);
    }
  }, []);

  useEffect(() => {
    if (!routeProjectId) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, routeProjectId);
    setStoredProjectId(routeProjectId);
  }, [routeProjectId]);

  useEffect(() => {
    if (!activeProjectId) {
      setProgress(null);
      setError(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`/api/projects/${activeProjectId}/progress`, {
          cache: "no-store"
        });
        const result = (await response.json()) as ProgressResponse & { message?: string };

        if (!response.ok) {
          throw new Error(result.message ?? "Failed to load progress.");
        }

        if (!cancelled) {
          setProgress(result);
          setError(null);
          if (result.tracker.isActive) {
            setIsOpen(true);
          }
        }
      } catch (trackerError) {
        if (!cancelled) {
          setError(trackerError instanceof Error ? trackerError.message : "Failed to load progress.");
        }
      }
    };

    void load();
    const interval = window.setInterval(load, progress?.tracker.isActive ? 2000 : 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeProjectId, progress?.tracker.isActive]);

  if (!activeProjectId || (!progress && !error)) {
    return null;
  }

  const progressPercent = progress?.tracker.progressPercent ?? 0;
  const progressMode = progress?.tracker.progressMode ?? "determinate";
  const bubbleLabel = progress?.tracker.stepLabel ?? "Video status";
  const progressCopy = progressMode === "indeterminate" && progress?.tracker.isActive ? "Live" : `${progressPercent}%`;

  return (
    <div className="project-progress-tracker" aria-live="polite">
      {isOpen ? (
        <section className="project-progress-tracker__panel" aria-label="Video creation progress">
          <div className="project-progress-tracker__header">
            <div>
              <p className="project-progress-tracker__eyebrow">Video creation</p>
              <h2>{progress?.projectName ?? "Current project"}</h2>
            </div>
            <button
              type="button"
              className="project-progress-tracker__close"
              onClick={() => setIsOpen(false)}
              aria-label="Close progress panel"
            >
              Close
            </button>
          </div>

          <div
            className={`project-progress-tracker__meter${progressMode === "indeterminate" ? " project-progress-tracker__meter--indeterminate" : ""}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressMode === "determinate" ? progressPercent : undefined}
            aria-valuetext={progressMode === "indeterminate" ? "Rendering in progress" : `${progressPercent}% complete`}
          >
            <div
              className={`project-progress-tracker__meter-fill${progressMode === "indeterminate" ? " project-progress-tracker__meter-fill--indeterminate" : ""}`}
              style={progressMode === "determinate" ? { width: `${progressPercent}%` } : undefined}
            />
          </div>

          <div className="project-progress-tracker__status">
            <strong>{progress?.tracker.stepLabel ?? "Checking status"}</strong>
            <span>{progressCopy}</span>
          </div>

          <p className="project-progress-tracker__detail">
            {error ?? progress?.tracker.detailLabel ?? "Checking the latest project state."}
          </p>

          {progress ? (
            <div className="project-progress-tracker__stats">
              <div>
                <span>Stage</span>
                <strong>{progress.currentStageLabel}</strong>
              </div>
              <div>
                <span>Scenes</span>
                <strong>
                  {progress.counts.approvedScenes}/{progress.counts.scenes}
                </strong>
              </div>
              <div>
                <span>Clips</span>
                <strong>
                  {progress.counts.completedClips}/{progress.counts.scenes || progress.counts.clips}
                </strong>
              </div>
              <div>
                <span>Render</span>
                <strong>{progress.render ? progress.render.status : "waiting"}</strong>
              </div>
            </div>
          ) : null}

          {progress?.publish?.errorMessage ? (
            <p className="project-progress-tracker__note">{progress.publish.errorMessage}</p>
          ) : null}

          <div className="project-progress-tracker__actions">
            <Button asChild className="bg-white !text-black hover:bg-white/94">
              <Link href={clipReviewRoute(activeProjectId)} prefetch={false}>
                Queue
              </Link>
            </Button>
            <Button asChild variant="secondary" className="border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
              <Link href={renderRoute(activeProjectId)} prefetch={false}>
                Render
              </Link>
            </Button>
            <Button asChild variant="secondary" className="border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
              <Link href={sequenceRouteForProject(activeProjectId)} prefetch={false}>
                Sequence
              </Link>
            </Button>
            {progress?.tracker.hasFinalRender ? (
              <Button asChild variant="ghost" className="text-white/72 hover:bg-white/8 hover:text-white">
                <Link href={publishRoute(activeProjectId)} prefetch={false}>
                  Handoff
                </Link>
              </Button>
            ) : null}
          </div>

          {progress?.render?.updatedAt ? (
            <p className="project-progress-tracker__timestamp">Updated {formatTimestamp(progress.render.updatedAt)}</p>
          ) : null}
        </section>
      ) : null}

      <button
        type="button"
        className="project-progress-tracker__fab"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Hide video creation progress" : "Show video creation progress"}
      >
        <span className="project-progress-tracker__fab-icon" aria-hidden="true">
          {progress?.tracker.hasFinalRender ? "OK" : "GO"}
        </span>
        <span className="project-progress-tracker__fab-copy">
          <strong>{bubbleLabel}</strong>
          <span>{progressCopy}</span>
        </span>
      </button>
    </div>
  );
}
