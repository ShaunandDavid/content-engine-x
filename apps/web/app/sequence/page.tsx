import type { Metadata } from "next";
import Link from "next/link";

import { getLatestPublishJobForProject, getLatestRenderForProject } from "@content-engine/db";

import DashboardPage from "../dashboard/page";
import { EnochTopNav } from "../../components/enoch/enoch-top-nav";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { stageLabels } from "../../lib/dashboard-data";
import { clipReviewRoute, projectRoute, publishRoute, renderRoute, sceneReviewRoute, workspaceRoute } from "../../lib/routes";
import { getProjectWorkspaceOrDemo } from "../../lib/server/project-data";

export const metadata: Metadata = {
  title: "Sequence",
  description: "Operational sequence view for live projects, queue state, and runtime blockers."
};

const normalizeProjectId = (value: string | string[] | undefined) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const formatTimestamp = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })
    : "Waiting";

const formatStatus = (value: string) =>
  value
    .replace(/_/g, " ")
    .split(" ")
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(" ");

export default async function SequencePage({
  searchParams
}: {
  searchParams?: Promise<{ projectId?: string | string[] }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const projectId = normalizeProjectId(resolvedSearchParams.projectId);

  if (!projectId) {
    return <DashboardPage />;
  }

  const workspace = await getProjectWorkspaceOrDemo(projectId);
  if (!workspace) {
    return <DashboardPage />;
  }

  const [latestRender, latestPublishJob] = await Promise.all([
    getLatestRenderForProject(projectId).catch(() => null),
    getLatestPublishJobForProject(projectId).catch(() => null)
  ]);

  const latestClipByScene = new Map<string, (typeof workspace.clips)[number]>();
  [...workspace.clips]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .forEach((clip) => {
      if (!latestClipByScene.has(clip.sceneId)) {
        latestClipByScene.set(clip.sceneId, clip);
      }
    });

  const assetsById = new Map(workspace.assets.map((asset) => [asset.id, asset]));
  const completedSceneCount = workspace.scenes.filter((scene) => scene.status === "completed").length;
  const approvedSceneCount = workspace.scenes.filter((scene) => scene.approvalStatus === "approved").length;
  const completedClipCount = [...latestClipByScene.values()].filter((clip) => clip.status === "completed").length;
  const activeClipCount = [...latestClipByScene.values()].filter((clip) => ["pending", "queued", "running"].includes(clip.status)).length;
  const hasFinalRender = latestRender?.status === "completed";
  const hasPublish = latestPublishJob?.status === "completed";

  return (
    <main className="min-h-[100dvh] bg-[#040404] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[920px] bg-[radial-gradient(circle_at_16%_12%,rgba(94,234,212,0.13),transparent_18%),radial-gradient(circle_at_78%_10%,rgba(168,85,247,0.18),transparent_18%),linear-gradient(180deg,#040404_0%,#05070b_48%,#040404_100%)]" />
      <EnochTopNav currentRoute="sequence" />

      <section className="relative px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1480px] space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Badge variant="outline" className="border-white/12 bg-white/5 text-white/70">
                Sequence
              </Badge>
              <div className="space-y-2">
                <h1 className="text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">{workspace.project.name}</h1>
                <p className="max-w-2xl text-sm leading-7 text-white/56 sm:text-base">
                  One project view for scenes, clip output, and the final handoff state.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="secondary" className="border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                <Link href={`${workspaceRoute}?projectId=${encodeURIComponent(projectId)}`} prefetch={false}>
                  Workspace
                </Link>
              </Button>
              <Button asChild className="bg-white !text-black hover:bg-white/94">
                <Link href={projectRoute(projectId)} prefetch={false}>
                  Project
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Stage</p>
              <p className="mt-3 text-xl font-semibold tracking-[-0.05em] text-white">{stageLabels[workspace.project.currentStage]}</p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Scenes</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{completedSceneCount}</p>
              <p className="mt-2 text-xs text-white/46">{approvedSceneCount} approved</p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Clips</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{completedClipCount}</p>
              <p className="mt-2 text-xs text-white/46">{activeClipCount} active</p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Render</p>
              <p className="mt-3 text-xl font-semibold tracking-[-0.05em] text-white">{hasFinalRender ? "Ready" : "Pending"}</p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Publish</p>
              <p className="mt-3 text-xl font-semibold tracking-[-0.05em] text-white">{hasPublish ? "Sent" : "Waiting"}</p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <div className="rounded-[38px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
                <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Pipeline flow</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">What has happened</h2>
                    </div>
                    <Badge variant="outline" className="border-white/12 bg-transparent text-white/60">
                      {formatStatus(workspace.project.status)}
                    </Badge>
                  </div>

                  <div className="mt-5 grid gap-3 lg:grid-cols-4">
                    {[
                      {
                        step: "1",
                        title: "Scenes",
                        status: `${completedSceneCount}/${workspace.scenes.length} completed`,
                        copy: `${approvedSceneCount} approved and ready for downstream work.`,
                        href: sceneReviewRoute(projectId)
                      },
                      {
                        step: "2",
                        title: "Clips",
                        status: `${completedClipCount}/${workspace.scenes.length} latest clips completed`,
                        copy: activeClipCount > 0 ? `${activeClipCount} still processing.` : "Generation is finished for the latest pass.",
                        href: clipReviewRoute(projectId)
                      },
                      {
                        step: "3",
                        title: "Render",
                        status: hasFinalRender ? "completed" : "not started",
                        copy: hasFinalRender ? "Final output exists." : "Clip assets are ready for final assembly.",
                        href: renderRoute(projectId)
                      },
                      {
                        step: "4",
                        title: "Publish",
                        status: hasPublish ? "completed" : "waiting",
                        copy: hasPublish ? "Latest render has been handed off." : "Publish only starts after a final render exists.",
                        href: publishRoute(projectId)
                      }
                    ].map((item) => (
                      <Link
                        key={item.title}
                        href={item.href}
                        prefetch={false}
                        className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4 transition-colors hover:bg-white/8"
                      >
                        <p className="text-[10px] uppercase tracking-[0.22em] text-white/34">{item.step}</p>
                        <p className="mt-3 text-lg font-medium text-white">{item.title}</p>
                        <p className="mt-2 text-sm text-white/68">{item.status}</p>
                        <p className="mt-2 text-sm leading-6 text-white/48">{item.copy}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[38px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
                <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Latest scene outputs</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">Per-scene results</h2>
                    </div>
                    <Button asChild variant="ghost" className="text-white/72 hover:bg-white/8 hover:text-white">
                      <Link href={clipReviewRoute(projectId)} prefetch={false}>
                        Open queue
                      </Link>
                    </Button>
                  </div>

                  <div className="mt-5 space-y-3">
                    {workspace.scenes.map((scene) => {
                      const clip = latestClipByScene.get(scene.id);
                      const asset = clip?.sourceAssetId ? assetsById.get(clip.sourceAssetId) : null;
                      return (
                        <div key={scene.id} className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-white">
                                {scene.ordinal}. {scene.title}
                              </p>
                              <p className="text-xs text-white/44">
                                {scene.durationSeconds}s / {scene.approvalStatus} / {formatStatus(scene.status)}
                              </p>
                            </div>
                            <Badge variant="outline" className="border-white/12 bg-transparent text-white/60">
                              {clip ? formatStatus(clip.status) : "No clip yet"}
                            </Badge>
                          </div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-white/34">Prompt to scene</p>
                              <p className="mt-2 text-sm text-white/64">{scene.title} is planned and approved.</p>
                            </div>
                            <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-white/34">Extension</p>
                              <p className="mt-2 text-sm text-white/64">
                                {clip?.requestedDurationSeconds && clip.requestedDurationSeconds > 12
                                  ? `Extended to ${clip.requestedDurationSeconds}s in the latest pass.`
                                  : "Single-pass duration in the latest pass."}
                              </p>
                            </div>
                            <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-white/34">Stored output</p>
                              <p className="mt-2 break-all text-sm text-white/64">
                                {asset ? asset.objectKey : "Not persisted yet"}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <aside className="space-y-5">
              <div className="rounded-[34px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Latest records</p>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-[22px] border border-white/10 bg-black/18 px-4 py-4">
                      <p className="text-sm font-medium text-white">Project updated</p>
                      <p className="mt-1 text-xs text-white/44">{formatTimestamp(workspace.project.updatedAt)}</p>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-black/18 px-4 py-4">
                      <p className="text-sm font-medium text-white">Latest render</p>
                      <p className="mt-1 text-xs text-white/44">{latestRender ? `${formatStatus(latestRender.status)} / ${formatTimestamp(latestRender.updatedAt)}` : "No render record yet"}</p>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-black/18 px-4 py-4">
                      <p className="text-sm font-medium text-white">Latest publish</p>
                      <p className="mt-1 text-xs text-white/44">{latestPublishJob ? `${formatStatus(latestPublishJob.status)} / ${formatTimestamp(latestPublishJob.updatedAt)}` : "No publish record yet"}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[34px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Next actions</p>
                  <div className="mt-4 grid gap-3">
                    <Button asChild className="justify-between bg-white !text-black hover:bg-white/94">
                      <Link href={sceneReviewRoute(projectId)} prefetch={false}>
                        <span>Review scenes</span>
                        <span>{approvedSceneCount}</span>
                      </Link>
                    </Button>
                    <Button asChild variant="secondary" className="justify-between border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                      <Link href={clipReviewRoute(projectId)} prefetch={false}>
                        <span>Open clips</span>
                        <span>{completedClipCount}</span>
                      </Link>
                    </Button>
                    <Button asChild variant="secondary" className="justify-between border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                      <Link href={renderRoute(projectId)} prefetch={false}>
                        <span>Render final video</span>
                        <span>{hasFinalRender ? "ready" : "next"}</span>
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
