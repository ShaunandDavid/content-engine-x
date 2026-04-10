"use client";

import Link from "next/link";

import { Menu } from "lucide-react";

import { cn } from "../../lib/utils";
import { accountRoute, homeRoute, projectsRoute, sequenceRoute, studioRoute, workspaceRoute } from "../../lib/routes";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../ui/sheet";

const navItems = [
  { href: workspaceRoute, label: "Workspace", route: "workspace" },
  { href: projectsRoute, label: "Projects", route: "projects" },
  { href: studioRoute, label: "Studio", route: "studio" },
  { href: sequenceRoute, label: "Sequence", route: "sequence" }
] as const;

type CurrentRoute = "home" | "assistant" | "workspace" | "studio" | "projects" | "plan" | "account" | "sequence" | "dashboard" | "systems";

export const EnochTopNav = ({
  currentRoute
}: {
  currentRoute?: CurrentRoute;
} = {}) => {
  const brandLabel = currentRoute === "home" ? "ENOCH" : "Content Engine X";

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
      <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-3 rounded-full border border-white/12 bg-black/65 px-3 py-2.5 text-white shadow-[0_28px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
        <div className="flex min-w-0 items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 rounded-full border border-white/10 bg-white/5 p-0 text-white hover:bg-white/10 hover:text-white md:hidden"
              >
                <Menu className="h-4 w-4" />
                <span className="sr-only">Open navigation</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="border-white/10 bg-[#09090b]/95 text-white">
              <SheetHeader>
                <SheetTitle className="text-white">Navigate Enoch</SheetTitle>
                <SheetDescription className="text-white/60">Move between the core operator surfaces.</SheetDescription>
              </SheetHeader>
              <div className="mt-8 flex flex-col gap-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className={cn(
                      "rounded-2xl px-4 py-3 text-sm font-medium text-white/70 transition-colors hover:bg-white/8 hover:text-white",
                      currentRoute === item.route && "bg-white text-black"
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          <Link href={homeRoute} prefetch={false} className="truncate text-xs font-semibold uppercase tracking-[0.28em] text-white/72">
            {brandLabel}
          </Link>
        </div>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium text-white/68 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/10 hover:text-white",
                currentRoute === item.route && "bg-white text-black shadow-[0_12px_30px_rgba(255,255,255,0.18)] hover:bg-white hover:text-black"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href={accountRoute}
            prefetch={false}
            aria-label="Open account"
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/14 bg-white/7 text-[11px] font-semibold uppercase tracking-[0.22em] text-white transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/12",
              currentRoute === "account" && "bg-white text-black"
            )}
          >
            DA
          </Link>
        </div>
      </div>
    </header>
  );
};
