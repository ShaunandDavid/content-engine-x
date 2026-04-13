import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Silkscreen, Space_Grotesk } from "next/font/google";

import { EnochTopNav } from "../components/enoch/enoch-top-nav";
import { SplineScene } from "../components/spline/spline-scene";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { accountRoute, enochAssistantRoute, loginRoute, projectsRoute, sequenceRoute, studioRoute, workspaceRoute } from "../lib/routes";

export const metadata: Metadata = {
  title: {
    absolute: "ENOCH"
  },
  description: "A cinematic operating surface for Enoch inside Content Engine X."
};

const pixelTitle = Silkscreen({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap"
});

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap"
});

const homeSplineScene = "https://prod.spline.design/1r5ngVkYbzPUc7At/scene.splinecode";
const homeGlobeScene = "https://prod.spline.design/dxycfm-5hVPz4mzI/scene.splinecode";

export default function EnochHomepage() {
  return (
    <main className={`min-h-screen overflow-hidden bg-[#040404] text-white ${bodyFont.className}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1120px] bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.24),transparent_42%),radial-gradient(circle_at_78%_16%,rgba(56,189,248,0.16),transparent_20%),linear-gradient(180deg,#040404_0%,#06070b_46%,#040404_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_20%,transparent_78%,rgba(255,255,255,0.02))]" />
      <EnochTopNav currentRoute="home" />

      <section className="relative px-4 pb-18 pt-10 sm:px-6 lg:px-8 lg:pb-24 lg:pt-14">
        <div className="mx-auto max-w-[1480px]">
          <div className="rounded-[40px] border border-white/10 bg-white/[0.035] p-1 shadow-[0_50px_140px_rgba(0,0,0,0.4)]">
            <div className="relative overflow-hidden rounded-[38px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.09),transparent_22%),radial-gradient(circle_at_78%_26%,rgba(255,255,255,0.08),transparent_18%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_35%,rgba(0,0,0,0.24))]" />

              <div className="grid min-h-[860px] gap-0 lg:grid-cols-[minmax(0,0.86fr)_minmax(560px,1.14fr)]">
                <div className="relative z-10 flex flex-col justify-between border-b border-white/10 p-6 sm:p-8 lg:border-b-0 lg:border-r lg:p-10 xl:p-12">
                  <div className="space-y-8">
                    <Badge variant="outline" className="border-white/12 bg-white/6 text-white/74">
                      Enoch operator surface
                    </Badge>

                    <div className="space-y-6">
                      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                        <div className="relative h-12 w-[7.5rem] shrink-0 sm:h-14 sm:w-[8.75rem] lg:h-16 lg:w-[10rem]">
                          <Image
                            src="/assets/enoch-logo.png"
                            alt="Enoch logo"
                            fill
                            priority
                            className="object-contain object-left brightness-[1.18] contrast-125 drop-shadow-[0_0_18px_rgba(124,58,237,0.12)]"
                            sizes="(max-width: 640px) 120px, (max-width: 1024px) 140px, 160px"
                          />
                        </div>
                        <p className="text-[0.82rem] font-medium uppercase tracking-[0.5em] text-white/76 sm:text-[0.9rem]">
                          Enoch
                        </p>
                      </div>

                      <p className={`${pixelTitle.className} max-w-[11ch] text-[clamp(2.7rem,7vw,6.8rem)] leading-[0.9] tracking-[0.08em] text-white`}>
                        The Mind is the Limit
                      </p>

                      <div className="max-w-xl space-y-4">
                        <p className="text-balance text-[clamp(1.05rem,1.9vw,1.45rem)] font-medium leading-relaxed text-white/72">
                          Enoch is the intelligent front door to Content Engine X: cinematic, composed, and ready to route thought into production.
                        </p>
                        <p className="max-w-lg text-sm leading-7 text-white/52 sm:text-base">
                          One intelligence field at the top. Deeper system layers appear as you move through the page.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-10 space-y-5">
                    <div className="flex flex-wrap gap-3">
                      <Button asChild size="lg" className="bg-white px-6 !text-black hover:bg-white/94">
                        <Link href={workspaceRoute} prefetch={false}>
                          Open Workspace
                        </Link>
                      </Button>
                      <Button asChild variant="secondary" size="lg" className="border-white/12 bg-white/8 px-6 text-white hover:bg-white/12 hover:text-white">
                        <Link href={projectsRoute} prefetch={false}>
                          Review Projects
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="lg" className="px-5 text-white/72 hover:bg-white/8 hover:text-white">
                        <Link href={enochAssistantRoute} prefetch={false}>
                          Open Enoch
                        </Link>
                      </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      {[
                        { label: "Workspace", copy: "The live orb surface and operator handoff layer." },
                        { label: "Studio", copy: "The creative board for shaping scenes and routes." },
                        { label: "Sequence", copy: "The operational readout for motion, blockers, and pace." }
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-[28px] border border-white/10 bg-black/18 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                        >
                          <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">{item.label}</p>
                          <p className="mt-2 text-sm leading-6 text-white/64">{item.copy}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="relative min-h-[440px] lg:min-h-[860px]">
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-[#040404]/54 to-transparent" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-t from-[#040404] via-[#040404]/68 to-transparent" />
                  <div className="absolute inset-0">
                    <SplineScene
                      scene={homeSplineScene}
                      eager
                      decorative
                      className="h-full w-full"
                      stageClassName="[&>div]:h-full [&_canvas]:!h-full [&_canvas]:!w-full"
                    />
                  </div>

                  <div className="relative z-20 flex h-full flex-col justify-end p-5 sm:p-7 lg:p-9">
                    <div className="max-w-[540px] rounded-[30px] border border-white/10 bg-black/30 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.26)] backdrop-blur-xl sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-2">
                          <p className="text-[10px] uppercase tracking-[0.24em] text-white/40">Intelligence field</p>
                          <h2 className="text-xl font-semibold tracking-[-0.04em] text-white sm:text-2xl">A premium front door, not a splash screen.</h2>
                        </div>
                        <Link href={studioRoute} prefetch={false} className="text-sm font-medium text-white/82">
                          Enter Studio
                        </Link>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[24px] border border-white/10 bg-white/[0.05] px-4 py-4">
                          <p className="text-[10px] uppercase tracking-[0.22em] text-white/36">Signal</p>
                          <p className="mt-2 text-sm leading-6 text-white/68">The main scene holds the hero together so the page starts with one clear field of focus.</p>
                        </div>
                        <div className="rounded-[24px] border border-white/10 bg-white/[0.05] px-4 py-4">
                          <p className="text-[10px] uppercase tracking-[0.22em] text-white/36">Flow</p>
                          <p className="mt-2 text-sm leading-6 text-white/68">The deeper system visuals arrive later, once the hero has already landed.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-transparent via-white/16 to-transparent" />
            </div>
          </div>
        </div>
      </section>

      <section id="home-globe-section" className="relative px-4 pb-20 pt-20 sm:px-6 lg:px-8 lg:pb-24 lg:pt-28">
        <div className="mx-auto max-w-[1480px]">
          <div className="rounded-[40px] border border-white/10 bg-white/[0.04] p-1 shadow-[0_36px_120px_rgba(0,0,0,0.34)]">
            <div className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.018))]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(147,51,234,0.24),transparent_18%),radial-gradient(circle_at_34%_50%,rgba(99,102,241,0.16),transparent_24%),linear-gradient(90deg,rgba(5,7,16,0.22),transparent_46%,rgba(255,255,255,0.04))]" />

              <div className="grid gap-0 lg:grid-cols-[minmax(420px,0.96fr)_minmax(0,1.04fr)] lg:items-center">
                <div className="relative min-h-[440px] border-b border-white/10 p-6 sm:min-h-[520px] sm:p-8 lg:min-h-[640px] lg:border-b-0 lg:border-r lg:p-10">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_42%_50%,rgba(168,85,247,0.16),transparent_22%),radial-gradient(circle_at_42%_50%,rgba(255,255,255,0.06),transparent_12%)]" />
                  <div
                    id="home-globe-stage"
                    className="relative flex h-full items-center justify-center overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_42%_50%,rgba(124,58,237,0.18),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.18))] shadow-[0_32px_110px_rgba(0,0,0,0.32)]"
                  >
                    <div className="pointer-events-none absolute left-1/2 top-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.44),rgba(91,33,182,0.14)_54%,rgba(0,0,0,0)_76%)] blur-3xl sm:h-[380px] sm:w-[380px]" />
                    <div className="pointer-events-none absolute left-1/2 top-1/2 h-[350px] w-[350px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-[radial-gradient(circle_at_46%_42%,rgba(255,255,255,0.1),transparent_54%)] shadow-[0_0_90px_rgba(124,58,237,0.18)] sm:h-[420px] sm:w-[420px]" />
                    <div className="relative h-[320px] w-[320px] sm:h-[400px] sm:w-[400px] lg:h-[460px] lg:w-[460px]">
                      <SplineScene
                        scene={homeGlobeScene}
                        eager
                        className="h-full w-full rounded-full"
                        stageClassName="[&>div]:h-full [&_canvas]:!h-full [&_canvas]:!w-full [&_spline-viewer]:origin-center [&_spline-viewer]:scale-[2.25] [&_spline-viewer]:translate-x-[-6%] [&_spline-viewer]:translate-y-[4%] [&_spline-viewer]:cursor-grab"
                        decorative={false}
                        fallback={<div className="h-full w-full rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.46),transparent_62%)] blur-3xl" />}
                      />
                    </div>
                  </div>
                </div>

                <div className="relative z-10 flex flex-col justify-center p-6 sm:p-8 lg:p-10 xl:p-12">
                  <div className="max-w-[560px] space-y-6">
                    <Badge variant="outline" className="border-white/12 bg-transparent text-white/72">
                      Second movement
                    </Badge>

                    <div className="space-y-4">
                      <h2 className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl xl:text-[3.35rem]">
                        The wider system comes into view after the hero lands.
                      </h2>
                      <p className="text-base leading-7 text-white/64 sm:text-lg">
                        The globe sits lower in the scroll so it reads like discovery, not noise. Drag it, inspect it, and then move straight into the working surfaces.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[26px] border border-white/10 bg-black/20 px-4 py-4">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-white/36">Interactive layer</p>
                        <p className="mt-2 text-sm leading-6 text-white/66">The globe remains live here, where it can breathe without competing with the hero field.</p>
                      </div>
                      <div className="rounded-[26px] border border-white/10 bg-black/20 px-4 py-4">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-white/36">Next move</p>
                        <p className="mt-2 text-sm leading-6 text-white/66">Workspace holds the orb, Studio shapes the scenes, and Sequence keeps the run moving.</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button asChild className="bg-white px-6 !text-black hover:bg-white/94">
                        <Link href={workspaceRoute} prefetch={false}>
                          Enter Workspace
                        </Link>
                      </Button>
                      <Button asChild variant="secondary" className="border-white/12 bg-white/8 px-6 text-white hover:bg-white/12 hover:text-white">
                        <Link href={sequenceRoute} prefetch={false}>
                          Review Sequence
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-transparent via-white/16 to-transparent" />
            </div>
          </div>
        </div>
      </section>

      <section className="relative px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1480px]">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.06fr)_380px]">
            <div className="rounded-[38px] border border-white/10 bg-white/[0.04] p-1 shadow-[0_32px_100px_rgba(0,0,0,0.28)]">
              <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02))] px-6 py-7 sm:px-8 sm:py-8">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_300px] lg:items-end">
                  <div className="space-y-5">
                    <Badge variant="outline" className="border-white/12 bg-transparent text-white/72">
                      Operator access
                    </Badge>

                    <div className="space-y-3">
                      <h2 className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">Access stays inside the same system language.</h2>
                      <p className="max-w-2xl text-base leading-7 text-white/64">Identity, account access, and route entry stay calm and tightly grouped instead of breaking the page rhythm.</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      {[
                        { label: "Open Login", href: loginRoute },
                        { label: "Operator Account", href: accountRoute },
                        { label: "Review Sequence", href: sequenceRoute }
                      ].map((item, index) => (
                        <Link
                          key={item.label}
                          href={item.href}
                          prefetch={false}
                          className="rounded-[26px] border border-white/10 bg-black/20 px-4 py-4 transition-colors hover:bg-white/8"
                        >
                          <p className="text-[10px] uppercase tracking-[0.22em] text-white/36">0{index + 1}</p>
                          <p className="mt-3 text-base font-medium text-white">{item.label}</p>
                        </Link>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[30px] border border-white/12 bg-black/22 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">Launch points</p>
                    <div className="mt-4 space-y-3">
                      {[
                        { label: "Workspace", copy: "Open Enoch's live operating surface." },
                        { label: "Projects", copy: "Move through active project records." },
                        { label: "Studio", copy: "Shape routes, assets, and scene direction." }
                      ].map((item) => (
                        <div key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.05] px-4 py-4">
                          <p className="text-sm font-medium text-white">{item.label}</p>
                          <p className="mt-1 text-sm leading-6 text-white/60">{item.copy}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[38px] border border-white/10 bg-white/[0.04] p-1 shadow-[0_32px_100px_rgba(0,0,0,0.28)]">
              <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-6 sm:p-7">
                <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Routes</p>
                <div className="mt-5 space-y-3">
                  {[
                    { label: "Workspace", copy: "Orb, voice, and active scene control." },
                    { label: "Projects", copy: "Project access and routing." },
                    { label: "Studio", copy: "Scene shaping and creative build." }
                  ].map((item) => (
                    <div key={item.label} className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                      <p className="text-sm font-medium text-white">{item.label}</p>
                      <p className="mt-1 text-sm leading-6 text-white/60">{item.copy}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
