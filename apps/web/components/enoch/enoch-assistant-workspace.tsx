"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  ExternalLink,
  FolderKanban,
  MessageSquareText,
  PanelLeft,
  Search,
  Send,
  Sparkles,
  WandSparkles
} from "lucide-react";

import type { EnochAssistantMessage } from "@content-engine/shared";
import { enochAssistantSceneBundleSchema } from "@content-engine/shared";

import { cn } from "../../lib/utils";
import { clipReviewRoute, projectRoute, sceneReviewRoute, workspaceRoute } from "../../lib/routes";
import type { EnochAssistantPageData } from "../../lib/server/enoch-assistant-data";
import { EnochSurfacePanel, EnochSurfaceShell } from "./enoch-surface";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from "../ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";

type Props = {
  initialData: EnochAssistantPageData;
};

type PendingAction = "sending" | "generating-scenes" | "exporting-scenes" | "creating-session" | "linking-project" | null;
type SessionListItem = EnochAssistantPageData["sessions"][number];
type ActiveSessionState = EnochAssistantPageData["activeSession"];

const truncate = (value: string, max = 120) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}...` : value);

const formatTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return "No activity yet";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};

const parseSceneBundleMessage = (message: EnochAssistantMessage) => {
  if (message.kind !== "scene_bundle") {
    return null;
  }

  const rawSceneBundle =
    typeof message.attachments === "object" && message.attachments !== null && "sceneBundle" in message.attachments
      ? message.attachments.sceneBundle
      : null;
  const parsed = enochAssistantSceneBundleSchema.safeParse(rawSceneBundle);

  if (!parsed.success) {
    return null;
  }

  return {
    ...message,
    sceneBundle: parsed.data
  };
};

const buildRouteHref = (sessionId: string | null, projectId?: string | null) => {
  const params = new URLSearchParams();
  if (sessionId) {
    params.set("sessionId", sessionId);
  }
  if (projectId) {
    params.set("projectId", projectId);
  }
  const query = params.toString();
  return query ? `/enoch?${query}` : "/enoch";
};

const buildWorkspaceHref = (projectId?: string | null) =>
  projectId ? `${workspaceRoute}?projectId=${encodeURIComponent(projectId)}` : workspaceRoute;

const historyButtonClassName =
  "w-full rounded-[22px] border border-border/60 bg-background/70 px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-accent/50";

const sourceCardClassName =
  "rounded-[22px] border border-border/60 bg-background/70 p-4 shadow-sm";

export const EnochAssistantWorkspace = ({ initialData }: Props) => {
  const router = useRouter();
  const [sessions, setSessions] = useState<EnochAssistantPageData["sessions"]>(initialData.sessions);
  const [activeSession, setActiveSession] = useState<ActiveSessionState>(initialData.activeSession);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialData.activeProjectId);
  const [composerValue, setComposerValue] = useState("");
  const [sceneInstruction, setSceneInstruction] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSceneBundleMessageId, setSelectedSceneBundleMessageId] = useState<string | null>(
    initialData.sceneBundleMessages.at(-1)?.id ?? null
  );
  const [commandOpen, setCommandOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  useEffect(() => {
    setSessions(initialData.sessions);
    setActiveSession(initialData.activeSession);
    setActiveProjectId(initialData.activeProjectId);
    setSelectedSceneBundleMessageId(initialData.sceneBundleMessages.at(-1)?.id ?? null);
  }, [initialData]);

  const sceneBundleMessages = useMemo(
    () =>
      (activeSession?.messages ?? [])
        .map(parseSceneBundleMessage)
        .filter((message): message is NonNullable<ReturnType<typeof parseSceneBundleMessage>> => Boolean(message)),
    [activeSession]
  );

  const selectedSceneBundle =
    sceneBundleMessages.find((message) => message.id === selectedSceneBundleMessageId) ?? sceneBundleMessages.at(-1) ?? null;
  const selectedProject =
    initialData.recentProjects.projects.find((project) => project.id === activeProjectId) ??
    (initialData.workspace && initialData.workspace.project.id === activeProjectId ? initialData.workspace.project : null);

  const ensureSession = async () => {
    if (activeSession) {
      return activeSession.session.id;
    }

    setPendingAction("creating-session");
    const response = await fetch("/api/enoch/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        projectId: activeProjectId ?? undefined
      })
    });
    const payload = (await response.json()) as {
      session?: SessionListItem;
      message?: string;
    };

    if (!response.ok || !payload.session) {
      throw new Error(payload.message ?? "Failed to create a new Enoch conversation.");
    }

    const nextDetail = {
      session: payload.session,
      messages: []
    };

    setSessions((current) => [payload.session!, ...current]);
    setActiveSession(nextDetail);
    router.replace(buildRouteHref(payload.session.id, activeProjectId));
    return payload.session.id;
  };

  const refreshRoute = (sessionId: string | null, projectId?: string | null) => {
    router.replace(buildRouteHref(sessionId, projectId));
    router.refresh();
  };

  const submitMessage = async () => {
    const message = composerValue.trim();
    if (!message) {
      return;
    }

    setError(null);
    setPendingAction("sending");

    try {
      const sessionId = await ensureSession();
      const response = await fetch(`/api/enoch/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message,
          projectId: activeProjectId ?? undefined
        })
      });

      const payload = (await response.json()) as {
        session?: SessionListItem;
        userMessage?: EnochAssistantMessage;
        assistantMessage?: EnochAssistantMessage;
        message?: string;
      };

      if (!response.ok || !payload.session || !payload.userMessage || !payload.assistantMessage) {
        throw new Error(payload.message ?? "Enoch could not complete that turn.");
      }

      setComposerValue("");
      setActiveProjectId(payload.session.projectId ?? activeProjectId);
      setSessions((current) => [payload.session!, ...current.filter((session) => session.id !== payload.session!.id)]);
      setActiveSession((current) => ({
        session: payload.session!,
        messages: [...(current?.messages ?? []), payload.userMessage!, payload.assistantMessage!]
      }));

      if (payload.session.projectId !== activeProjectId) {
        refreshRoute(payload.session.id, payload.session.projectId ?? undefined);
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Enoch could not complete that turn.");
    } finally {
      setPendingAction(null);
    }
  };

  const createNewConversation = async () => {
    setError(null);
    setPendingAction("creating-session");

    try {
      const response = await fetch("/api/enoch/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId: activeProjectId ?? undefined
        })
      });

      const payload = (await response.json()) as {
        session?: SessionListItem;
        message?: string;
      };

      if (!response.ok || !payload.session) {
        throw new Error(payload.message ?? "Failed to create a new Enoch conversation.");
      }

      setSessions((current) => [payload.session!, ...current]);
      setActiveSession({ session: payload.session, messages: [] });
      setSelectedSceneBundleMessageId(null);
      router.replace(buildRouteHref(payload.session.id, activeProjectId));
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : "Failed to create a new conversation.");
    } finally {
      setPendingAction(null);
    }
  };

  async function linkProject(projectId: string) {
    if (!activeSession) {
      setActiveProjectId(projectId);
      refreshRoute(null, projectId);
      return;
    }

    setError(null);
    setPendingAction("linking-project");

    try {
      const response = await fetch(`/api/enoch/sessions/${activeSession.session.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId
        })
      });

      const payload = (await response.json()) as {
        session?: SessionListItem;
        message?: string;
      };

      if (!response.ok || !payload.session) {
        throw new Error(payload.message ?? "Failed to link the active project.");
      }

      setActiveProjectId(projectId);
      setSessions((current) => current.map((session) => (session.id === payload.session!.id ? payload.session! : session)));
      setActiveSession((current) => (current ? { ...current, session: payload.session! } : current));
      refreshRoute(payload.session.id, projectId);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Failed to link the active project.");
    } finally {
      setPendingAction(null);
    }
  }

  const generateSceneBundle = async () => {
    if (!activeProjectId) {
      setError("Select or create a project before generating scenes for Workspace.");
      return;
    }

    setError(null);
    setPendingAction("generating-scenes");

    try {
      const sessionId = await ensureSession();
      const response = await fetch(`/api/enoch/sessions/${sessionId}/scene-bundles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId: activeProjectId,
          instruction: sceneInstruction.trim() || undefined
        })
      });

      const payload = (await response.json()) as {
        session?: SessionListItem;
        message?: EnochAssistantMessage;
      };

      if (!response.ok || !payload.session || !payload.message) {
        throw new Error((payload as { message?: string }).message ?? "Failed to generate a scene bundle.");
      }

      setSceneInstruction("");
      setSessions((current) => [payload.session!, ...current.filter((session) => session.id !== payload.session!.id)]);
      setActiveSession((current) => ({
        session: payload.session!,
        messages: [...(current?.messages ?? []), payload.message!]
      }));
      setSelectedSceneBundleMessageId(payload.message.id);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Failed to generate a scene bundle.");
    } finally {
      setPendingAction(null);
    }
  };

  const exportSelectedSceneBundle = async () => {
    if (!activeSession || !selectedSceneBundle || !activeProjectId) {
      setError("Select a generated scene set and a project destination before exporting to Workspace.");
      return;
    }

    setError(null);
    setPendingAction("exporting-scenes");

    try {
      const response = await fetch(
        `/api/enoch/sessions/${activeSession.session.id}/scene-bundles/${selectedSceneBundle.id}/export`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            projectId: activeProjectId
          })
        }
      );

      const payload = (await response.json()) as Record<string, unknown>;
      const nextSession = payload.session as SessionListItem | undefined;
      const updatedMessage = payload.message as EnochAssistantMessage | undefined;
      const eventMessage = payload.eventMessage as EnochAssistantMessage | undefined;
      const exportInfo = payload.export as { projectId?: string } | undefined;
      const errorMessage =
        typeof payload.message === "string"
          ? payload.message
          : typeof payload.messageText === "string"
            ? payload.messageText
            : "Failed to export scenes to Workspace.";

      if (!response.ok || !nextSession || !updatedMessage || !eventMessage) {
        throw new Error(errorMessage);
      }

      setSessions((current) => [nextSession, ...current.filter((session) => session.id !== nextSession.id)]);
      setActiveSession((current) => ({
        session: nextSession,
        messages: [...(current?.messages ?? [])].map((message) => (message.id === updatedMessage.id ? updatedMessage : message)).concat(eventMessage)
      }));
      refreshRoute(nextSession.id, exportInfo?.projectId ?? activeProjectId);
      setExportDialogOpen(false);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export scenes to Workspace.");
    } finally {
      setPendingAction(null);
    }
  };

  const commandItems = useMemo(
    () => [
      ...sessions.map((session) => ({
        id: session.id,
        value: `${session.generatedLabel ?? session.title} ${session.projectId ?? ""}`,
        label: session.generatedLabel ?? session.title,
        detail: formatTimestamp(session.lastMessageAt ?? session.updatedAt),
        shortcut: "Chat",
        onSelect: () => {
          setCommandOpen(false);
          router.push(buildRouteHref(session.id, session.projectId ?? undefined));
        }
      })),
      ...initialData.recentProjects.projects.map((project) => ({
        id: project.id,
        value: `${project.name} ${project.currentStage}`,
        label: project.name,
        detail: project.currentStage.replace(/_/g, " "),
        shortcut: "Project",
        onSelect: () => {
          setCommandOpen(false);
          void linkProject(project.id);
        }
      }))
    ],
    [initialData.recentProjects.projects, router, sessions]
  );

  const sidebarContent = (
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Enoch</p>
          <h1 className="text-2xl font-semibold tracking-[-0.05em]">Assistant Workspace</h1>
          <p className="text-sm text-muted-foreground">History, projects, and retrieval in one operator rail.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCommandOpen(true)}>
          <Search className="h-4 w-4" />
          Jump
        </Button>
      </div>

      <Button variant="secondary" onClick={createNewConversation} disabled={pendingAction === "creating-session"}>
        <Sparkles className="h-4 w-4" />
        {pendingAction === "creating-session" ? "Creating..." : "New Conversation"}
      </Button>

      <Separator />

      <div className="grid min-h-0 flex-1 gap-5">
        <div className="grid min-h-0 gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <MessageSquareText className="h-4 w-4 text-muted-foreground" />
              History
            </div>
            <Badge variant="secondary">{sessions.length}</Badge>
          </div>
          <ScrollArea className="h-[280px]">
            <div className="space-y-2 pr-3">
              {sessions.length > 0 ? (
                sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    className={cn(
                      historyButtonClassName,
                      activeSession?.session.id === session.id && "border-primary/30 bg-primary/5"
                    )}
                    onClick={() => router.push(buildRouteHref(session.id, session.projectId ?? undefined))}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{session.generatedLabel ?? session.title}</p>
                      <p className="text-xs text-muted-foreground">{formatTimestamp(session.lastMessageAt ?? session.updatedAt)}</p>
                      {session.projectId ? <p className="text-xs text-muted-foreground">{truncate(session.projectId, 18)}</p> : null}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-border bg-background/50 p-4 text-sm text-muted-foreground">
                  No stored conversations yet.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="grid min-h-0 gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
              Recent Projects
            </div>
            <Badge variant="secondary">{initialData.recentProjects.projects.length}</Badge>
          </div>
          <ScrollArea className="h-[220px]">
            <div className="space-y-2 pr-3">
              {initialData.recentProjects.ok && initialData.recentProjects.projects.length > 0 ? (
                initialData.recentProjects.projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={cn(historyButtonClassName, activeProjectId === project.id && "border-primary/30 bg-primary/5")}
                    onClick={() => void linkProject(project.id)}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{project.name}</p>
                      <p className="text-xs text-muted-foreground">{project.currentStage.replace(/_/g, " ")}</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-border bg-background/50 p-4 text-sm text-muted-foreground">
                  {initialData.recentProjects.message ?? "No persisted projects are available yet."}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );

  const mobileSidebar = (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="lg:hidden">
          <PanelLeft className="h-4 w-4" />
          History
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0">
        <SheetHeader className="border-b border-border/60 px-5 py-4">
          <SheetTitle>Enoch</SheetTitle>
          <SheetDescription>Stored sessions and project context.</SheetDescription>
        </SheetHeader>
        <div className="h-[calc(100%-4.75rem)] p-5">{sidebarContent}</div>
      </SheetContent>
    </Sheet>
  );

  return (
    <>
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Jump to a conversation or project..." />
        <CommandList>
          <CommandEmpty>No sessions or projects match.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {commandItems.map((item) => (
              <CommandItem key={`${item.shortcut}-${item.id}`} value={item.value} onSelect={item.onSelect}>
                <div className="grid gap-0.5">
                  <span>{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.detail}</span>
                </div>
                <CommandShortcut>{item.shortcut}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => void createNewConversation()}>
              <Sparkles className="h-4 w-4" />
              Start a new conversation
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export scenes to Workspace</DialogTitle>
            <DialogDescription>
              This will persist the selected scene bundle into the linked project workspace so it becomes the canonical scene and prompt set.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-[24px] border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
            {selectedSceneBundle ? (
              <div className="space-y-2">
                <p className="font-medium text-foreground">{selectedSceneBundle.sceneBundle.bundle.concept.title}</p>
                <p>
                  {selectedSceneBundle.sceneBundle.bundle.scenes.length} scenes and {selectedSceneBundle.sceneBundle.bundle.prompts.length} prompts will be written to {selectedProject?.name ?? "the active project"}.
                </p>
              </div>
            ) : (
              <p>No scene bundle is currently selected.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void exportSelectedSceneBundle()} disabled={pendingAction === "exporting-scenes" || !selectedSceneBundle || !activeProjectId}>
              {pendingAction === "exporting-scenes" ? "Exporting..." : "Confirm Export"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EnochSurfaceShell
        sidebar={<div className="hidden lg:block">{sidebarContent}</div>}
        main={
          <div className="min-w-0">
            <EnochSurfacePanel
              title={activeSession?.session.generatedLabel ?? activeSession?.session.title ?? "New conversation"}
              eyebrow="Conversation"
              description="A dedicated operator thread with stored history and project grounding."
              className="h-full"
              contentClassName="grid h-[min(72vh,880px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0"
              action={
                <div className="flex flex-wrap items-center gap-2">
                  {mobileSidebar}
                  <Badge variant={activeProjectId ? "success" : "secondary"}>{activeProjectId ? "Project linked" : "No active project"}</Badge>
                  {initialData.workspace ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={projectRoute(initialData.workspace.project.id)} prefetch={false}>
                        Overview
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              }
            >
              <ScrollArea className="min-h-0 px-5 py-5">
                <div className="space-y-4 pr-4">
                  {activeSession?.messages.length ? (
                    activeSession.messages.map((message) => {
                      const sceneBundleMessage = parseSceneBundleMessage(message);
                      const isUser = message.role === "user";

                      return (
                        <article
                          key={message.id}
                          className={cn(
                            "max-w-[90%] rounded-[28px] border px-5 py-4 shadow-sm",
                            isUser
                              ? "ml-auto border-primary/20 bg-primary text-primary-foreground"
                              : "border-border/60 bg-background"
                          )}
                        >
                          <div className={cn("mb-3 flex items-center justify-between gap-3 text-xs", isUser ? "text-primary-foreground/70" : "text-muted-foreground")}>
                            <span className="font-medium uppercase tracking-[0.16em]">{message.role === "user" ? "You" : "Enoch"}</span>
                            <span>{formatTimestamp(message.createdAt)}</span>
                          </div>
                          <p className={cn("text-sm leading-6", isUser ? "text-primary-foreground" : "text-foreground")}>{message.content}</p>
                          {sceneBundleMessage ? (
                            <Button
                              type="button"
                              variant={selectedSceneBundleMessageId === message.id ? "default" : "secondary"}
                              size="sm"
                              className="mt-4"
                              onClick={() => setSelectedSceneBundleMessageId(message.id)}
                            >
                              <WandSparkles className="h-4 w-4" />
                              {sceneBundleMessage.sceneBundle.bundle.scenes.length} scenes ready
                            </Button>
                          ) : null}
                        </article>
                      );
                    })
                  ) : (
                    <div className="grid gap-3 rounded-[30px] border border-dashed border-border bg-background/60 p-8">
                      <h3 className="text-lg font-semibold tracking-[-0.03em]">Start a working session.</h3>
                      <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                        Ask Enoch to shape direction, retrieve project memory, or generate a scene set for a linked workspace project.
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <Separator />

              <div className="grid gap-3 p-5">
                <Textarea
                  value={composerValue}
                  onChange={(event) => setComposerValue(event.target.value)}
                  placeholder="Talk to Enoch about the project, the audience, or what to generate next."
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Stored session context and project memory will be injected when available.
                  </p>
                  <Button onClick={() => void submitMessage()} disabled={pendingAction === "sending" || !composerValue.trim()}>
                    <Send className="h-4 w-4" />
                    {pendingAction === "sending" ? "Sending..." : "Send"}
                  </Button>
                </div>
                {error ? <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">{error}</div> : null}
              </div>
            </EnochSurfacePanel>
          </div>
        }
        context={
          <div className="min-w-0">
            <EnochSurfacePanel
              title={selectedProject?.name ?? initialData.workspace?.project.name ?? "No project selected"}
              eyebrow="Active Context"
              description="Project, memory, output, and export actions stay tied to the active assistant session."
              action={
                initialData.recentProjects.projects.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        Switch
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Projects</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {initialData.recentProjects.projects.map((project) => (
                        <DropdownMenuItem key={project.id} onClick={() => void linkProject(project.id)}>
                          <div className="grid gap-0.5">
                            <span>{project.name}</span>
                            <span className="text-xs text-muted-foreground">{project.currentStage.replace(/_/g, " ")}</span>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null
              }
              className="h-full"
              contentClassName="p-5"
            >
              <Tabs defaultValue="context" className="grid gap-4">
                <TabsList className="w-full justify-start overflow-auto">
                  <TabsTrigger value="context">Context</TabsTrigger>
                  <TabsTrigger value="memory">Memory</TabsTrigger>
                  <TabsTrigger value="output">Output</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>

                <TabsContent value="context" className="space-y-4">
                  <div className="grid gap-3">
                    <div className={sourceCardClassName}>
                      <div className="mb-2 flex items-center gap-2">
                        <MessageSquareText className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium text-foreground">Session history</p>
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">`enoch_chat_sessions` and `enoch_chat_messages` are the source of truth for assistant threads.</p>
                    </div>
                    <div className={sourceCardClassName}>
                      <div className="mb-2 flex items-center gap-2">
                        <FolderKanban className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium text-foreground">Project context</p>
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">`projects`, `briefs`, `scenes`, `prompts`, and `workflow_runs` drive the live working context.</p>
                    </div>
                    <div className={sourceCardClassName}>
                      <div className="mb-2 flex items-center gap-2">
                        <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium text-foreground">Project memory</p>
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">`enoch_brain_insights` is injected into retrieval and scene generation for the active project.</p>
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">{initialData.workspace?.brief?.objective ?? "Link a project to inject brief, workflow state, and memory into the session."}</p>
                    {initialData.enochDetail?.summary.reasoningSummary ? (
                      <p className="text-sm leading-6 text-muted-foreground">{initialData.enochDetail.summary.reasoningSummary}</p>
                    ) : null}
                  </div>
                </TabsContent>

                <TabsContent value="memory" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">Project memory</p>
                    <Badge variant="secondary">{initialData.brainInsights.length}</Badge>
                  </div>
                  <ScrollArea className="h-[420px]">
                    <div className="space-y-3 pr-3">
                      {initialData.brainInsights.length > 0 ? (
                        initialData.brainInsights.slice(0, 8).map((insight) => (
                          <div key={insight.id} className={sourceCardClassName}>
                            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                              {insight.category.replace(/_/g, " ")}
                            </p>
                            <p className="text-sm leading-6 text-foreground">{insight.insight}</p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[22px] border border-dashed border-border bg-background/50 p-4 text-sm text-muted-foreground">
                          No project-linked memory has been reinforced yet for this context.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="output" className="space-y-4">
                  <Textarea
                    value={sceneInstruction}
                    onChange={(event) => setSceneInstruction(event.target.value)}
                    placeholder="Optional: steer the next scene set with one clear instruction."
                    className="min-h-[112px]"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button variant="secondary" onClick={() => void generateSceneBundle()} disabled={pendingAction === "generating-scenes" || !activeProjectId}>
                      <WandSparkles className="h-4 w-4" />
                      {pendingAction === "generating-scenes" ? "Generating..." : "Generate Scenes"}
                    </Button>
                    <Button onClick={() => setExportDialogOpen(true)} disabled={pendingAction === "exporting-scenes" || !selectedSceneBundle || !activeProjectId}>
                      <ExternalLink className="h-4 w-4" />
                      {pendingAction === "exporting-scenes" ? "Exporting..." : "Export to Workspace"}
                    </Button>
                  </div>

                  {selectedSceneBundle ? (
                    <div className="space-y-4 rounded-[26px] border border-border/60 bg-background/60 p-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{selectedSceneBundle.sceneBundle.bundle.scenes.length} scenes</Badge>
                          <Badge variant={selectedSceneBundle.sceneBundle.exportedAt ? "success" : "outline"}>
                            {selectedSceneBundle.sceneBundle.exportedAt ? "Exported" : "Ready"}
                          </Badge>
                        </div>
                        <h3 className="text-base font-semibold tracking-[-0.03em] text-foreground">
                          {selectedSceneBundle.sceneBundle.bundle.concept.title}
                        </h3>
                      </div>

                      <div className="space-y-3">
                        {selectedSceneBundle.sceneBundle.bundle.scenes.map((scene) => (
                          <div key={scene.sceneId} className={sourceCardClassName}>
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-foreground">{scene.ordinal}. {scene.title}</p>
                              <span className="text-xs text-muted-foreground">{scene.durationSeconds}s</span>
                            </div>
                            <p className="text-sm leading-6 text-muted-foreground">{scene.visualBeat}</p>
                          </div>
                        ))}
                      </div>

                      {activeProjectId ? (
                        <div className="grid gap-2 sm:grid-cols-3">
                          <Button asChild variant="outline" size="sm">
                            <Link href={sceneReviewRoute(activeProjectId)} prefetch={false}>Scene Planner</Link>
                          </Button>
                          <Button asChild variant="outline" size="sm">
                            <Link href={buildWorkspaceHref(activeProjectId)} prefetch={false}>Workspace</Link>
                          </Button>
                          <Button asChild variant="outline" size="sm">
                            <Link href={clipReviewRoute(activeProjectId)} prefetch={false}>Queue</Link>
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-border bg-background/50 p-4 text-sm text-muted-foreground">
                      Generate a scene bundle and it will appear here with a real Workspace export action.
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="history" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">Generation history</p>
                    <Badge variant="secondary">{sceneBundleMessages.length}</Badge>
                  </div>
                  <ScrollArea className="h-[420px]">
                    <div className="space-y-2 pr-3">
                      {sceneBundleMessages.length > 0 ? (
                        sceneBundleMessages
                          .slice()
                          .reverse()
                          .map((message) => (
                            <button
                              key={message.id}
                              type="button"
                              className={cn(historyButtonClassName, selectedSceneBundleMessageId === message.id && "border-primary/30 bg-primary/5")}
                              onClick={() => setSelectedSceneBundleMessageId(message.id)}
                            >
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground">{message.sceneBundle.bundle.concept.title}</p>
                                <p className="text-xs text-muted-foreground">{formatTimestamp(message.createdAt)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {message.sceneBundle.exportedAt
                                    ? `Exported to ${truncate(message.sceneBundle.exportedProjectId ?? "", 18)}`
                                    : "Not exported yet"}
                                </p>
                              </div>
                            </button>
                          ))
                      ) : (
                        <div className="rounded-[22px] border border-dashed border-border bg-background/50 p-4 text-sm text-muted-foreground">
                          Generated scene history will accumulate here per session.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </EnochSurfacePanel>
          </div>
        }
      />
    </>
  );
};
