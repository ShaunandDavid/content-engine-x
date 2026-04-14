"use client";

import Link from "next/link";
import { type FormEvent, type KeyboardEvent } from "react";

import { useEnochVoice } from "../../hooks/use-enoch-voice";
import { clipReviewRoute, enochAssistantRoute, sceneReviewRoute } from "../../lib/routes";
import { SplineScene } from "../spline/spline-scene";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

const workspaceSplineScene = "https://prod.spline.design/YSt2x6UBC3haTfFM/scene.splinecode";

const buildAssistantHref = (projectId: string | null, sessionId: string | null) => {
  const params = new URLSearchParams();

  if (projectId) {
    params.set("projectId", projectId);
  }

  if (sessionId) {
    params.set("sessionId", sessionId);
  }

  const query = params.toString();
  return query ? `${enochAssistantRoute}?${query}` : enochAssistantRoute;
};

const runtimeLabel = (voiceState: "idle" | "listening" | "thinking" | "speaking" | "error") => {
  switch (voiceState) {
    case "listening":
      return "Listening";
    case "thinking":
      return "Thinking";
    case "speaking":
      return "Speaking";
    case "error":
      return "Recovering";
    default:
      return "Ready";
  }
};

const primaryActionLabel = (voiceState: "idle" | "listening" | "thinking" | "speaking" | "error") => {
  switch (voiceState) {
    case "listening":
      return "Stop + Send";
    case "thinking":
      return "Thinking...";
    case "speaking":
      return "Interrupt";
    case "error":
      return "Try Voice Again";
    default:
      return "Talk to Enoch";
  }
};

export const WorkspaceOrbConsole = ({
  activeProjectId,
  activeProjectName
}: {
  activeProjectId: string | null;
  activeProjectName: string | null;
}) => {
  const {
    sessionId,
    voiceState,
    interimTranscript,
    finalTranscript,
    assistantReply,
    error,
    textInput,
    statusMessage,
    playbackMessage,
    playbackMode,
    isAudioPlaybackAvailable,
    orbSignalLevel,
    orbSignalSource,
    signalTruthLabel,
    setTextInput,
    handleOrbPress,
    cancelListening,
    interruptPlayback,
    submitTextFallback,
    restartSession
  } = useEnochVoice({ projectId: activeProjectId });

  const liveTranscript = finalTranscript || interimTranscript;
  const assistantHref = buildAssistantHref(activeProjectId, sessionId);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitTextFallback();
  };

  const handleKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && textInput.trim() && voiceState !== "thinking") {
      event.preventDefault();
      await submitTextFallback();
    }
  };

  return (
    <div className="rounded-[40px] border border-white/12 bg-white/[0.05] p-1 shadow-[0_40px_130px_rgba(0,0,0,0.34)]">
      <div className="rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.025))] p-4 text-white backdrop-blur-xl sm:p-6 lg:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <Badge variant="outline" className="border-white/14 bg-white/8 text-white/78">
              Workspace intelligence core
            </Badge>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-[-0.05em] text-white sm:text-3xl">One orb. One live thread. One working surface.</h2>
              <p className="max-w-2xl text-sm leading-6 text-white/58 sm:text-base">Speak, type, review the reply, and move straight into scene work.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-white/12 bg-transparent text-white/64">
              {activeProjectName ?? "No active project"}
            </Badge>
            <Badge variant="outline" className="border-white/12 bg-transparent text-white/64">
              {runtimeLabel(voiceState)}
            </Badge>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <div className="relative overflow-hidden rounded-[38px] border border-white/10 bg-black/28 min-h-[520px] shadow-[0_32px_110px_rgba(0,0,0,0.32)] sm:min-h-[620px]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.14),transparent_14%),radial-gradient(circle_at_50%_54%,rgba(56,189,248,0.12),transparent_26%),radial-gradient(circle_at_50%_60%,rgba(124,58,237,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))]" />
            <div className="pointer-events-none absolute left-1/2 top-[18%] h-[440px] w-[440px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(147,197,253,0.26),rgba(124,58,237,0.22)_44%,rgba(0,0,0,0)_72%)] blur-3xl sm:h-[560px] sm:w-[560px]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[#040404]/52 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-[#040404] via-[#040404]/72 to-transparent" />

            <div className="absolute inset-0">
              <SplineScene
                scene={workspaceSplineScene}
                eager
                decorative={false}
                className="h-full w-full opacity-[0.92]"
                stageClassName="[&>div]:h-full [&_canvas]:!h-full [&_canvas]:!w-full [&_spline-viewer]:cursor-grab [&_spline-viewer]:origin-center [&_spline-viewer]:scale-[1.18] [&_spline-viewer]:translate-y-[3%] sm:[&_spline-viewer]:scale-[1.28]"
                fallback={<div className="h-full w-full bg-[radial-gradient(circle_at_50%_38%,rgba(147,197,253,0.42),rgba(124,58,237,0.24)_34%,rgba(0,0,0,0)_68%)]" />}
              />
            </div>

            <div className="relative z-20 flex h-full items-start justify-between p-5 sm:p-7 lg:p-8">
              <div className="rounded-full border border-white/12 bg-black/20 px-4 py-2 text-[10px] uppercase tracking-[0.24em] text-white/52 backdrop-blur-md">
                Workspace intelligence core
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <div className="rounded-[30px] border border-white/10 bg-black/24 px-5 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-white/36">Orb controls</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="border-white/12 bg-white/[0.04] text-white/64">
                        Signal {orbSignalSource.replaceAll("_", " ")}
                      </Badge>
                      <Badge variant="outline" className="border-white/12 bg-white/[0.04] text-white/64">
                        Playback {playbackMode.replaceAll("_", " ")}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={handleOrbPress} disabled={voiceState === "thinking"} className="bg-white px-6 !text-black hover:bg-white/94">
                      {primaryActionLabel(voiceState)}
                    </Button>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-white/50">
                      Drag the core to inspect
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_280px]">
                <div className="rounded-[28px] border border-white/10 bg-black/32 px-5 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/36">Live readout</p>
                  <div className="mt-3 space-y-2">
                    <p className="text-2xl font-semibold tracking-[-0.05em] text-white">{runtimeLabel(voiceState)}</p>
                    <p className="text-sm leading-6 text-white/70">{statusMessage}</p>
                    <p className="text-xs leading-5 text-white/42">{signalTruthLabel}</p>
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-black/30 px-5 py-5 backdrop-blur-xl">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/36">Output path</p>
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-medium text-white">{isAudioPlaybackAvailable ? "Voice output available" : "Text-first runtime"}</p>
                    <p className="text-sm leading-6 text-white/60">{playbackMessage}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <article className="rounded-[30px] border border-white/10 bg-black/22 px-5 py-5 backdrop-blur-xl">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/36">Voice input</p>
                  <div className="mt-3 space-y-2">
                    <p className="text-lg font-semibold tracking-[-0.04em] text-white">Transcript</p>
                    <p className="min-h-[96px] text-sm leading-6 text-white/70">
                      {liveTranscript || "Tap the orb and Enoch will capture the live transcript here."}
                    </p>
                    {interimTranscript && !finalTranscript ? (
                      <p className="text-xs uppercase tracking-[0.2em] text-sky-200/72">Capturing live speech</p>
                    ) : null}
                  </div>
                </article>

                <article className="rounded-[30px] border border-white/10 bg-black/22 px-5 py-5 backdrop-blur-xl">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/36">Voice output</p>
                  <div className="mt-3 space-y-2">
                    <p className="text-lg font-semibold tracking-[-0.04em] text-white">Enoch reply</p>
                    <p className="min-h-[96px] text-sm leading-6 text-white/70">
                      {assistantReply || "Enoch's spoken or typed response will appear here so the reply is always readable."}
                    </p>
                    <p className="text-xs leading-5 text-white/42">{playbackMessage}</p>
                  </div>
                </article>
              </div>

              <form onSubmit={handleSubmit} className="rounded-[32px] border border-white/10 bg-black/24 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:px-6 sm:py-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-white/36">Typed command</p>
                    <p className="mt-2 text-sm leading-6 text-white/58">Use text for precise prompts, scene edits, or quick route decisions.</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-white/46">
                    Ctrl+Enter
                  </span>
                </div>

                <Textarea
                  id="workspace-enoch-prompt"
                  value={textInput}
                  onChange={(event) => setTextInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  className="mt-5 min-h-[156px] border-white/10 bg-black/26 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] placeholder:text-white/30"
                  placeholder="Ask for a scene rewrite, a clip angle, an image-to-video move, or the next project action."
                />

                {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {activeProjectId ? (
                      <>
                        <Button asChild variant="ghost" size="sm" className="h-9 rounded-full px-4 text-white/72 hover:bg-white/10 hover:text-white">
                          <Link href={clipReviewRoute(activeProjectId)} prefetch={false}>
                            Image to Video
                          </Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm" className="h-9 rounded-full px-4 text-white/72 hover:bg-white/10 hover:text-white">
                          <Link href={sceneReviewRoute(activeProjectId)} prefetch={false}>
                            Edit Scenes
                          </Link>
                        </Button>
                      </>
                    ) : null}
                  </div>

                  <Button type="submit" disabled={voiceState === "thinking" || !textInput.trim()} className="bg-white px-5 !text-black hover:bg-white/92">
                    {voiceState === "thinking" ? "Sending..." : "Send to Enoch"}
                  </Button>
                </div>
              </form>
            </div>

            <aside className="space-y-4">
              <div className="rounded-[32px] border border-white/10 bg-black/22 px-5 py-5 backdrop-blur-xl">
                <p className="text-[10px] uppercase tracking-[0.24em] text-white/36">Session</p>
                <div className="mt-4 grid gap-3">
                  {voiceState === "listening" ? (
                    <Button onClick={cancelListening} variant="secondary" className="w-full border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                      Cancel turn
                    </Button>
                  ) : null}

                  {voiceState === "speaking" ? (
                    <Button onClick={interruptPlayback} variant="secondary" className="w-full border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                      Interrupt playback
                    </Button>
                  ) : null}

                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/36">Current thread</p>
                    <p className="mt-2 text-sm leading-6 text-white/68">
                      {sessionId ? "This workspace turn is attached to a saved Enoch thread." : "Start a turn and Enoch will keep the thread linked to this project."}
                    </p>
                  </div>

                  <Button onClick={restartSession} variant="ghost" className="w-full text-white/72 hover:bg-white/8 hover:text-white">
                    Start fresh
                  </Button>
                </div>
              </div>

              <div className="rounded-[32px] border border-white/10 bg-black/22 px-5 py-5 backdrop-blur-xl">
                <p className="text-[10px] uppercase tracking-[0.24em] text-white/36">Project actions</p>
                <div className="mt-4 grid gap-3">
                  {activeProjectId ? (
                    <>
                      <Button asChild className="w-full justify-between bg-white !text-black hover:bg-white/94">
                        <Link href={clipReviewRoute(activeProjectId)} prefetch={false}>
                          <span>Image to Video</span>
                          <span className="text-black/40">01</span>
                        </Link>
                      </Button>
                      <Button asChild variant="secondary" className="w-full justify-between border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                        <Link href={sceneReviewRoute(activeProjectId)} prefetch={false}>
                          <span>Edit Scenes</span>
                          <span className="text-white/42">02</span>
                        </Link>
                      </Button>
                      <Button asChild variant="secondary" className="w-full justify-between border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                        <Link href={assistantHref} prefetch={false}>
                          <span>Thread + Assistant</span>
                          <span className="text-white/42">03</span>
                        </Link>
                      </Button>
                    </>
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-white/10 bg-black/18 px-4 py-5 text-sm leading-6 text-white/50">
                      Pick a project in the left rail to unlock scene actions.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[32px] border border-white/10 bg-black/22 px-5 py-5 backdrop-blur-xl">
                <p className="text-[10px] uppercase tracking-[0.24em] text-white/36">Voice path</p>
                <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-4">
                  <p className="text-sm leading-6 text-white/68">
                    {isAudioPlaybackAvailable ? "Voice output is available on this device when playback succeeds." : "This device stays text-first and keeps the full reply readable."}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};
