import Link from "next/link";

import { demoProject } from "../lib/dashboard-data";
import { clipReviewRoute, projectRoute } from "../lib/routes";

export default function HomePage() {
  return (
    <main style={{ padding: "32px" }}>
      <section className="hero-card">
        <p className="eyebrow">Phase 1 Operator Shell</p>
        <h1>From brief to publish handoff in one controlled pipeline.</h1>
        <p>
          This shell covers intake, planning, clip review, render assembly, and publish preparation for the first
          version of CONTENT ENGINE X.
        </p>
        <div className="tag-row" style={{ marginTop: "20px", marginBottom: "28px" }}>
          <span className="tag">Next.js 15</span>
          <span className="tag">LangGraph</span>
          <span className="tag">OpenAI Sora</span>
          <span className="tag">Supabase</span>
          <span className="tag">FFmpeg</span>
        </div>
        <div className="button-row">
          <Link className="button" href="/projects/new">
            Create Project
          </Link>
          <Link className="button button--secondary" href="/adam/plan">
            Adam Text Plan
          </Link>
          <Link className="button button--secondary" href={projectRoute(demoProject.id)}>
            Open Demo Project (Sample Data)
          </Link>
          <Link className="button button--secondary" href={clipReviewRoute(demoProject.id)}>
            Review Demo Clips
          </Link>
        </div>
      </section>
    </main>
  );
}
