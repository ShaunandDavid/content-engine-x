"use client";

import Link from "next/link";
import { EnochVoiceSurface } from "../components/enoch/enoch-voice-surface";
import { EnochTopNav } from "../components/enoch/enoch-top-nav";
import { dashboardRoute } from "../lib/routes";

export default function EnochHomepage() {
  return (
    <main className="enoch-home-main">
      <EnochTopNav currentRoute="home" />
      <div className="enoch-center-content">
        <EnochVoiceSurface />

        <div className="enoch-home-text">
          <p className="enoch-home-eyebrow">Voice-First Project Copilot</p>
          <h1>Keep Enoch close to the real project state without losing the calm.</h1>
          <p>
            Enoch listens, reasons server-side against the current workspace, and replies through the active runtime path.
            The homepage now reflects that truth directly instead of faking confidence in the visual layer.
          </p>
          <div className="enoch-home-actions">
            <Link href="/projects/new" className="button button--solid" prefetch={false}>START PROJECT FLOW</Link>
            <Link href={dashboardRoute} className="button button--outline" prefetch={false}>OPEN CONSOLE</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
