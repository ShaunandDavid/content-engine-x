"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { MessageCircleMore, Mic, Wand2 } from "lucide-react";

import { useEnochVoice } from "../hooks/use-enoch-voice";
import { clipReviewRoute, enochAssistantRoute, publishRoute, renderRoute, sequenceRouteForProject, workspaceRoute } from "../lib/routes";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

const STORAGE_KEY = "enoch-active-project-id";

const extractProjectIdFromPath = (pathname: string) => {
  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  return projectMatch ? decodeURIComponent(projectMatch[1]) : null;
};

const runtimeLabel = (voiceState: "idle" | "listening" | "thinking" | "speaking" | "error") => {
  switch (voiceState) {
    case "listening":
      return "Listening";
    case "thinking":
      return "Working";
    case "speaking":
      return "Responding";
    case "error":
      return "Needs attention";
    default:
      return "Ready";
  }
};

export function EnochGlobalControl() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [storedProjectId, setStoredProjectId] = useState<string | null>(null);
  const routeProjectId = useMemo(() => searchParams.get("projectId") ?? extractProjectIdFromPath(pathname), [pathname, searchParams]);
  const activeProjectId = routeProjectId ?? storedProjectId;
  const isPrimarySurface = pathname.startsWith("/workspace") || pathname.startsWith("/enoch");

  const {
    sessionId,
    voiceState,
    finalTranscript,
    interimTranscript,
    assistantReply,
    error,
    textInput,
    statusMessage,
    setTextInput,
    handleOrbPress,
    submitTextFallback
  } = useEnochVoice({ projectId: activeProjectId });

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

  const liveTranscript = finalTranscript || interimTranscript;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitTextFallback();
    setIsOpen(true);
  };

  return (
    <div className="fixed bottom-6 left-6 z-[60] flex max-w-[calc(100vw-3rem)] flex-col items-start gap-3">
      {isOpen ? (
        <section className="w-[min(420px,calc(100vw-3rem))] rounded-[28px] border border-white/12 bg-[#08080b]/92 p-4 text-white shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/42">Enoch control</p>
              <h2 className="mt-2 text-lg font-semibold tracking-[-0.04em] text-white">Direct voice and text control</h2>
            </div>
            <button
              type="button"
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/62 transition-colors hover:bg-white/10 hover:text-white"
              onClick={() => setIsOpen(false)}
            >
              Close
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/54">
              {runtimeLabel(voiceState)}
            </span>
            {activeProjectId ? (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/54">
                Project attached
              </span>
            ) : (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/54">
                No project attached
              </span>
            )}
            {sessionId ? (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/54">
                Thread live
              </span>
            ) : null}
          </div>

          <p className="mt-4 text-sm leading-6 text-white/66">{statusMessage}</p>

          {liveTranscript ? (
            <div className="mt-4 rounded-[22px] border border-white/10 bg-black/28 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/36">Transcript</p>
              <p className="mt-2 text-sm leading-6 text-white/74">{liveTranscript}</p>
            </div>
          ) : null}

          {assistantReply ? (
            <div className="mt-3 rounded-[22px] border border-white/10 bg-black/28 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/36">Enoch reply</p>
              <p className="mt-2 text-sm leading-6 text-white/78">{assistantReply}</p>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <Textarea
              value={textInput}
              onChange={(event) => setTextInput(event.target.value)}
              className="min-h-[112px] border-white/10 bg-black/28 text-white placeholder:text-white/28"
              placeholder="Tell Enoch to create a project, generate clips, render the final video, publish handoff, or open a surface."
            />
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleOrbPress} disabled={voiceState === "thinking"} className="bg-white !text-black hover:bg-white/94">
                <Mic className="h-4 w-4" />
                {voiceState === "listening" ? "Stop + Send" : "Talk to Enoch"}
              </Button>
              <Button type="submit" disabled={voiceState === "thinking" || !textInput.trim()} variant="secondary" className="border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                <Wand2 className="h-4 w-4" />
                Send command
              </Button>
              {!isPrimarySurface ? (
                <Button asChild variant="ghost" className="text-white/68 hover:bg-white/8 hover:text-white">
                  <Link href={activeProjectId ? `${enochAssistantRoute}?projectId=${encodeURIComponent(activeProjectId)}` : enochAssistantRoute} prefetch={false}>
                    Open assistant
                  </Link>
                </Button>
              ) : null}
            </div>
          </form>

          {activeProjectId ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/72 transition-colors hover:bg-white/10 hover:text-white" href={`${workspaceRoute}?projectId=${encodeURIComponent(activeProjectId)}`} prefetch={false}>
                Workspace
              </Link>
              <Link className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/72 transition-colors hover:bg-white/10 hover:text-white" href={clipReviewRoute(activeProjectId)} prefetch={false}>
                Generate clips
              </Link>
              <Link className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/72 transition-colors hover:bg-white/10 hover:text-white" href={renderRoute(activeProjectId)} prefetch={false}>
                Render final
              </Link>
              <Link className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/72 transition-colors hover:bg-white/10 hover:text-white" href={sequenceRouteForProject(activeProjectId)} prefetch={false}>
                Sequence
              </Link>
              <Link className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/72 transition-colors hover:bg-white/10 hover:text-white sm:col-span-2" href={publishRoute(activeProjectId)} prefetch={false}>
                Publish handoff
              </Link>
            </div>
          ) : (
            <p className="mt-4 text-xs leading-5 text-white/46">Create a project first, then Enoch can generate clips, render the final video, and send handoff directly from here.</p>
          )}
        </section>
      ) : null}

      <button
        type="button"
        className="inline-flex items-center gap-3 rounded-full border border-white/12 bg-[#09090b]/92 px-4 py-3 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-colors hover:bg-[#111115]"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Hide Enoch control" : "Show Enoch control"}
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(255,255,255,0.24),rgba(168,85,247,0.62)_36%,rgba(15,23,42,0.96)_80%)] shadow-[0_0_24px_rgba(168,85,247,0.24)]">
          <MessageCircleMore className="h-4 w-4 text-white" />
        </span>
        <span className="flex flex-col items-start text-left">
          <strong className="text-sm font-semibold tracking-[-0.02em] text-white">Enoch control</strong>
          <span className="text-xs text-white/54">{runtimeLabel(voiceState)}</span>
        </span>
      </button>
    </div>
  );
}
