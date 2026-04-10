"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import type { ProjectIndexItem } from "../../lib/server/projects-index";
import { cn } from "../../lib/utils";
import { enochAssistantRoute } from "../../lib/routes";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

const buildAssistantHref = (projectId: string | null) =>
  projectId ? `${enochAssistantRoute}?projectId=${encodeURIComponent(projectId)}` : enochAssistantRoute;

export const WorkspaceOrbConsole = ({
  projects,
  defaultProjectId,
  activeProjectName
}: {
  projects: ProjectIndexItem[];
  defaultProjectId: string | null;
  activeProjectName: string | null;
}) => {
  const router = useRouter();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(defaultProjectId ?? projects[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasProjects = projects.length > 0;

  const handleSend = async () => {
    if (!prompt.trim()) {
      setError("Add a prompt before sending it to Enoch.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const sessionResponse = await fetch("/api/enoch/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: prompt.trim().slice(0, 72),
          projectId: selectedProjectId || undefined
        })
      });

      const sessionPayload = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok || !sessionPayload?.session?.id) {
        throw new Error(
          typeof sessionPayload?.message === "string" && sessionPayload.message.trim()
            ? sessionPayload.message
            : "Enoch could not open a new workspace conversation."
        );
      }

      const messageResponse = await fetch(`/api/enoch/sessions/${encodeURIComponent(sessionPayload.session.id)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt.trim(),
          projectId: selectedProjectId || undefined
        })
      });

      const messagePayload = await messageResponse.json().catch(() => ({}));
      if (!messageResponse.ok) {
        throw new Error(
          typeof messagePayload?.message === "string" && messagePayload.message.trim()
            ? messagePayload.message
            : "Enoch could not send that workspace prompt."
        );
      }

      startTransition(() => {
        const params = new URLSearchParams();
        params.set("sessionId", sessionPayload.session.id);
        if (selectedProjectId) {
          params.set("projectId", selectedProjectId);
        }
        router.push(`${enochAssistantRoute}?${params.toString()}`);
      });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Enoch could not open the assistant workspace.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-[32px] border border-white/12 bg-white/7 p-1 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.06))] p-5 text-white backdrop-blur-xl sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Badge variant="outline" className="border-white/14 bg-white/8 text-white/82">
              Workspace console
            </Badge>
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.04em] text-white sm:text-2xl">Talk to Enoch from the project surface.</h2>
              <p className="max-w-2xl text-sm text-white/68 sm:text-base">
                This console opens a real assistant session with the selected project bound in context.
              </p>
            </div>
          </div>
          <Button asChild variant="secondary" className="border-white/12 bg-white/10 text-white hover:bg-white/16 hover:text-white">
            <Link href={buildAssistantHref(selectedProjectId || null)} prefetch={false}>
              Open full assistant
            </Link>
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Badge variant="outline" className="border-white/12 bg-transparent text-white/65">
            {activeProjectName ?? "No active project"}
          </Badge>
          <Badge variant="outline" className="border-white/12 bg-transparent text-white/65">
            {hasProjects ? `${projects.length} project${projects.length === 1 ? "" : "s"} ready` : "Create a project first"}
          </Badge>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-2">
            <label htmlFor="workspace-enoch-project" className="text-xs font-medium uppercase tracking-[0.22em] text-white/52">
              Active project
            </label>
            <div className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-1.5">
              <select
                id="workspace-enoch-project"
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                className={cn(
                  "h-11 w-full bg-transparent text-sm text-white outline-none",
                  !hasProjects && "text-white/50"
                )}
              >
                {!hasProjects ? <option value="">No project available</option> : null}
                {projects.map((project) => (
                  <option key={project.id} value={project.id} className="bg-slate-950 text-white">
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <label htmlFor="workspace-enoch-prompt" className="text-xs font-medium uppercase tracking-[0.22em] text-white/52">
              Prompt
            </label>
            <Textarea
              id="workspace-enoch-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-[148px] border-white/10 bg-black/22 text-white placeholder:text-white/34"
              placeholder="Ask Enoch for the next move, a project summary, a scene angle, or a route recommendation."
            />
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            onClick={handleSend}
            disabled={pending || !prompt.trim()}
            className="bg-white text-black hover:bg-white/92"
          >
            {pending ? "Opening..." : "Send to Enoch"}
          </Button>
          <p className="text-sm text-white/54">The conversation opens on the dedicated assistant route with this project context attached.</p>
        </div>
      </div>
    </div>
  );
};
