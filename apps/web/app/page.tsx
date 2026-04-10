import type { Metadata } from "next";
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
    <main className={`min-h-screen bg-[#040404] text-white ${bodyFont.className}`}>
      <div className="absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.2),transparent_44%),radial-gradient(circle_at_78%_18%,rgba(56,189,248,0.14),transparent_22%),linear-gradient(180deg,#040404_0%,#06070b_45%,#040404_100%)]" />
      <EnochTopNav currentRoute="home" />

      <section className="relative overflow-hidden px-4 pb-20 pt-12 sm:px-6 lg:px-8 lg:pb-28 lg:pt-16">
        <div className="mx-auto grid max-w-[1480px] gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(540px,1.1fr)] lg:items-center">
          <div className="relative z-10 space-y-8">
            <div className="space-y-5">
              <Badge variant="outline" className="border-white/12 bg-white/5 text-white/72">
                Enoch operator surface
              </Badge>
              <div className="space-y-5">
                <p className={`${pixelTitle.className} max-w-[12ch] text-[clamp(2.2rem,7vw,5.8rem)] leading-[0.94] tracking-[0.08em] text-white`}>
                  The Mind is the Limit
                </p>
                <h1 className="max-w-xl text-balance text-[clamp(1.15rem,2vw,1.55rem)] font-medium leading-relaxed text-white/72">
                  Enoch now lands as a cinematic operating interface for thinking, routing, and production control across Content Engine X.
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-white text-black hover:bg-white/94">
                <Link href={workspaceRoute} prefetch={false}>
                  Open Workspace
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="border-white/12 bg-white/8 text-white hover:bg-white/12 hover:text-white">
                <Link href={projectsRoute} prefetch={false}>
                  Review Projects
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg" className="text-white/72 hover:bg-white/8 hover:text-white">
                <Link href={enochAssistantRoute} prefetch={false}>
                  Open Enoch
                </Link>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Workspace", copy: "Orb, context, and quick assistant handoff." },
                { label: "Studio", copy: "Creative build surface for deeper scene shaping." },
                { label: "Sequence", copy: "Live queue, blockers, and operational timing." }
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[28px] border border-white/10 bg-white/[0.045] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                >
                  <p className="text-xs uppercase tracking-[0.24em] text-white/42">{item.label}</p>
                  <p className="mt-2 text-sm leading-6 text-white/68">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative lg:min-h-[720px]">
            <div className="absolute right-0 top-10 hidden h-[280px] w-[280px] lg:block">
              <SplineScene
                scene={homeGlobeScene}
                eager
                decorative
                className="opacity-70"
                fallback={<div className="h-full w-full rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.4),transparent_66%)] blur-2xl" />}
              />
            </div>

            <div className="relative mx-auto min-h-[420px] overflow-hidden rounded-[36px] border border-white/12 bg-white/[0.04] shadow-[0_40px_120px_rgba(0,0,0,0.38)] sm:min-h-[520px] lg:min-h-[700px]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.14),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.01))]" />
              <SplineScene
                scene={homeSplineScene}
                eager
                decorative
                className="h-full w-full"
                stageClassName="[&>div]:h-full [&_canvas]:!h-full [&_canvas]:!w-full"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#040404] via-[#040404]/55 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 rounded-[28px] border border-white/10 bg-black/24 px-5 py-4 backdrop-blur-md">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-white/42">Identity layer</p>
                    <p className="mt-2 max-w-lg text-sm leading-6 text-white/70">
                      Two Spline systems shape the front door: a primary intelligence field plus a restrained purple globe accent to keep depth without clutter.
                    </p>
                  </div>
                  <Link href={studioRoute} prefetch={false} className="text-sm font-medium text-white/88">
                    Enter Studio
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1480px] gap-6 lg:grid-cols-[minmax(0,1.1fr)_420px]">
          <div className="rounded-[36px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_32px_100px_rgba(0,0,0,0.28)] sm:p-8">
            <Badge variant="outline" className="border-white/12 bg-transparent text-white/72">
              Operator access
            </Badge>
            <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(280px,0.7fr)] lg:items-end">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">Login should feel like the next layer of the same system.</h2>
                <p className="max-w-2xl text-base leading-7 text-white/68">
                  Scroll into a clean access block instead of a dropped-in form. From here, operators can enter Workspace, go straight to account context, or move into live projects.
                </p>
              </div>

              <div className="rounded-[30px] border border-white/12 bg-black/22 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <p className="text-xs uppercase tracking-[0.22em] text-white/42">Access box</p>
                <div className="mt-4 space-y-3">
                  <Button asChild className="w-full bg-white text-black hover:bg-white/94">
                    <Link href={loginRoute} prefetch={false}>Open Login</Link>
                  </Button>
                  <Button asChild variant="secondary" className="w-full border-white/12 bg-white/9 text-white hover:bg-white/14 hover:text-white">
                    <Link href={accountRoute} prefetch={false}>
                      Operator Account
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" className="w-full text-white/70 hover:bg-white/8 hover:text-white">
                    <Link href={sequenceRoute} prefetch={false}>
                      Review Sequence
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[36px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_32px_100px_rgba(0,0,0,0.28)] sm:p-7">
            <p className="text-xs uppercase tracking-[0.24em] text-white/42">System posture</p>
            <div className="mt-5 space-y-4 text-sm leading-6 text-white/68">
              <div className="rounded-[26px] border border-white/10 bg-black/16 px-4 py-4">
                Workspace now owns the orb experience and quick assistant handoff.
              </div>
              <div className="rounded-[26px] border border-white/10 bg-black/16 px-4 py-4">
                Studio stays focused on creative composition instead of acting as the brand front door.
              </div>
              <div className="rounded-[26px] border border-white/10 bg-black/16 px-4 py-4">
                Sequence remains the operational readout for project velocity and blockers.
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
