"use client";

import { useState } from "react";
import Link from "next/link";
import { AdamOrb, AdamState } from "../components/adam/adam-orb";
import { AdamTopNav } from "../components/adam/adam-top-nav";
import { workspaceRoute } from "../lib/routes";

export default function AdamHomepage() {
  const [orbState, setOrbState] = useState<AdamState>("idle");

  const cycleState = () => {
    const states: AdamState[] = ["idle", "listening", "thinking", "speaking"];
    setOrbState(prev => states[(states.indexOf(prev) + 1) % states.length]);
  };

  return (
    <main className="adam-home-main">
      <AdamTopNav />
      <div className="adam-center-content">
        {/* Core Animated Presence */}
        <AdamOrb state={orbState} onClick={cycleState} />
        
        {/* Typographical elements below the orb per Figma structure */}
        <div className="adam-home-text">
          <p>
            Welcome to the core of ADAM. Your intuitive workspace for high-<br/>
            precision content architecture and generative systems.
          </p>
          <div className="adam-home-actions">
            <Link href={workspaceRoute} className="button button--solid" prefetch={false}>OPEN WORKSPACE</Link>
            <Link href="/projects/new" className="button button--outline" prefetch={false}>QUICK ACTION</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
