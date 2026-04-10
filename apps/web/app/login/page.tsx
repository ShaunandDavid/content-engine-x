import type { Metadata } from "next";
import Link from "next/link";

import { EnochTopNav } from "../../components/enoch/enoch-top-nav";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { accountRoute, homeRoute, workspaceRoute } from "../../lib/routes";

export const metadata: Metadata = {
  title: "Operator Access",
  description: "Open the current operator workspace, account, or return to the Enoch homepage."
};

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#040404] text-white">
      <div className="absolute inset-x-0 top-0 h-[440px] bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.22),transparent_32%),linear-gradient(180deg,#040404_0%,#05060a_60%,#040404_100%)]" />
      <EnochTopNav />

      <section className="relative px-4 pb-16 pt-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[840px] rounded-[38px] border border-white/12 bg-white/[0.045] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.36)] sm:p-8">
          <Badge variant="outline" className="border-white/12 bg-white/5 text-white/72">
            Operator access
          </Badge>
          <div className="mt-5 space-y-4">
            <h1 className="text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">Access is routed through the live operator environment.</h1>
            <p className="max-w-2xl text-base leading-7 text-white/66">
              Authentication wiring is still environment-led, so this page stays honest: no fake form, no dead submit button, just real routes into the current operator context.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Button asChild className="w-full bg-white text-black hover:bg-white/94">
              <Link href={workspaceRoute} prefetch={false}>Open Workspace</Link>
            </Button>
            <Button asChild variant="secondary" className="w-full border-white/12 bg-white/8 text-white hover:bg-white/14 hover:text-white">
              <Link href={accountRoute} prefetch={false}>
                Operator Account
              </Link>
            </Button>
            <Button asChild variant="ghost" className="w-full text-white/72 hover:bg-white/8 hover:text-white">
              <Link href={homeRoute} prefetch={false}>
                Return Home
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
