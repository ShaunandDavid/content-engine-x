"use client";

import Link from "next/link";
import { AdamVoiceSurface } from "../components/adam/adam-voice-surface";
import { AdamTopNav } from "../components/adam/adam-top-nav";
import { dashboardRoute } from "../lib/routes";

export default function AdamHomepage() {
  return (
    <main className="adam-home-main">
      <AdamTopNav currentRoute="home" />
      <div className="adam-center-content">
        <AdamVoiceSurface />

        <div className="adam-home-text">
          <p className="adam-home-eyebrow">Voice-First Project Copilot</p>
          <h1>Keep Adam close to the real project state without losing the calm.</h1>
          <p>
            Adam listens, reasons server-side against the current workspace, and replies through the active runtime path.
            The homepage now reflects that truth directly instead of faking confidence in the visual layer.
          </p>
          <div className="adam-home-actions">
            <Link href="/projects/new" className="button button--solid" prefetch={false}>START PROJECT FLOW</Link>
            <Link href={dashboardRoute} className="button button--outline" prefetch={false}>OPEN CONSOLE</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
