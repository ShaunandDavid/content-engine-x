"use client";

import { useState } from "react";

import Link from "next/link";

import { adamPlanRoute, homeRoute, newProjectRoute, projectsRoute, studioRoute, workspaceRoute } from "../../lib/routes";

export const AdamTopNav = ({
  currentRoute
}: {
  currentRoute?: "home" | "workspace" | "studio" | "projects" | "plan";
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className={`adam-header${isOpen ? " adam-header--open" : ""}`}>
      <div className="adam-header-left">
        <Link href={homeRoute} prefetch={false}>
          <strong>ADAM</strong>
        </Link>
      </div>
      <button
        className="adam-top-nav__toggle"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={isOpen}
      >
        <span />
        <span />
        <span />
      </button>
      <nav className="adam-header-center" onClick={() => setIsOpen(false)}>
        <Link href={homeRoute} prefetch={false} aria-current={currentRoute === "home" ? "page" : undefined}>
          Home
        </Link>
        <Link href={workspaceRoute} prefetch={false} aria-current={currentRoute === "workspace" ? "page" : undefined}>
          Workspace
        </Link>
        <Link href={studioRoute} prefetch={false} aria-current={currentRoute === "studio" ? "page" : undefined}>
          Studio
        </Link>
        <Link href={projectsRoute} prefetch={false} aria-current={currentRoute === "projects" ? "page" : undefined}>
          Projects
        </Link>
        <Link href={adamPlanRoute} prefetch={false} aria-current={currentRoute === "plan" ? "page" : undefined}>
          Adam Plan
        </Link>
      </nav>
      <div className="adam-header-right">
        <Link href={newProjectRoute} prefetch={false} className="button button--solid adam-header-cta">
          New Project
        </Link>
      </div>
    </header>
  );
};
