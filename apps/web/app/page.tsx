import type { Metadata } from "next";
import Link from "next/link";
import { EnochVoiceSurface } from "../components/enoch/enoch-voice-surface";
import { EnochTopNav } from "../components/enoch/enoch-top-nav";
import { dashboardRoute } from "../lib/routes";

export const metadata: Metadata = {
  title: "Enoch Voice Console",
  description: "Talk to Enoch, review live route state, and move into the Project Enoch pipeline."
};

export default function EnochHomepage() {
  return (
    <main className="enoch-home-main">
      <EnochTopNav currentRoute="home" />
      <div className="enoch-center-content">
        <EnochVoiceSurface />

        <div className="enoch-home-text">
          <p className="enoch-home-eyebrow">ENOCH</p>
          <h1>Voice control for the live project graph.</h1>
          <p>
            Project Enoch keeps voice, planning, and live route state aligned inside Content Engine X.
          </p>
          <div className="enoch-home-actions">
            <Link href="/projects/new" className="button button--solid" prefetch={false}>Create a Project</Link>
            <Link href={dashboardRoute} className="button button--outline" prefetch={false}>Open Pipeline</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
