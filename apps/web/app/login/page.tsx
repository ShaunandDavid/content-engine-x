import type { Metadata } from "next";
import Link from "next/link";

import { EnochTopNav } from "../../components/enoch/enoch-top-nav";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { accountRoute, homeRoute, projectsRoute, workspaceRoute } from "../../lib/routes";

export const metadata: Metadata = {
  title: "Operator Access",
  description: "Open the live operator surfaces from one clean access page."
};

export default function LoginPage() {
  return (
    <main className="min-h-[100dvh] bg-[#040404] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[780px] bg-[radial-gradient(circle_at_18%_14%,rgba(94,234,212,0.12),transparent_18%),radial-gradient(circle_at_74%_8%,rgba(168,85,247,0.2),transparent_18%),linear-gradient(180deg,#040404_0%,#05070b_48%,#040404_100%)]" />
      <EnochTopNav />

      <section className="relative px-4 pb-20 pt-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1240px] gap-5 lg:grid-cols-[minmax(0,1.15fr)_360px]">
          <div className="rounded-[42px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_34px_110px_rgba(0,0,0,0.36)]">
            <div className="rounded-[38px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-8 sm:p-10">
              <Badge variant="outline" className="border-white/12 bg-white/5 text-white/72">
                Operator access
              </Badge>
              <div className="mt-6 space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">
                  Enter the live Enoch system.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-white/58 sm:text-base">
                  No fake auth shell. Open the surfaces that are already wired and working.
                </p>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <Button asChild className="h-12 bg-white !text-black hover:bg-white/94">
                  <Link href={workspaceRoute} prefetch={false}>
                    Workspace
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="h-12 border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                  <Link href={projectsRoute} prefetch={false}>
                    Projects
                  </Link>
                </Button>
                <Button asChild variant="ghost" className="h-12 text-white/72 hover:bg-white/8 hover:text-white">
                  <Link href={accountRoute} prefetch={false}>
                    Account
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <aside className="rounded-[38px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-6">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Routes</p>
              <div className="mt-5 space-y-3">
                <div className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                  <p className="text-sm font-medium text-white">Workspace</p>
                  <p className="mt-1 text-sm text-white/52">Orb, chat, and active project flow.</p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                  <p className="text-sm font-medium text-white">Projects</p>
                  <p className="mt-1 text-sm text-white/52">Open current work and jump to the right surface.</p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                  <p className="text-sm font-medium text-white">Account</p>
                  <p className="mt-1 text-sm text-white/52">Operator identity and dashboard access.</p>
                </div>
              </div>

              <Button asChild variant="ghost" className="mt-6 w-full text-white/72 hover:bg-white/8 hover:text-white">
                <Link href={homeRoute} prefetch={false}>
                  Return Home
                </Link>
              </Button>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
