import React, { ReactNode } from "react";
import Link from "next/link";
import { dashboardRoute } from "../../lib/routes";

export const WorkspaceLayout = ({ children, toolbarTitle }: { children: ReactNode; toolbarTitle: string }) => {
  return (
    <div className="ws-layout">
      <header className="ws-toolbar">
        <div className="ws-toolbar-left">
          <Link href="/" className="ws-brand" prefetch={false}>ADAM</Link>
          <span className="ws-divider">/</span>
          <span className="ws-title">{toolbarTitle}</span>
        </div>
        <div className="ws-toolbar-center">
          <span className="ws-tool-icon active">Cursor</span>
          <span className="ws-tool-icon">Hand</span>
          <span className="ws-tool-icon">Comment</span>
        </div>
        <div className="ws-toolbar-right">
          <Link href={dashboardRoute} className="ws-btn" prefetch={false}>Operator Console</Link>
          <div className="ws-avatar" />
        </div>
      </header>

      <div className="ws-body">
        <aside className="ws-sidebar">
          <div className="ws-sidebar-section">
            <p className="ws-sidebar-title">ASSETS</p>
            <ul>
              <li>Stitched Videos <span>3</span></li>
              <li>Raw Clips <span>12</span></li>
              <li>Images <span>8</span></li>
              <li>Prompts <span>4</span></li>
            </ul>
          </div>
        </aside>

        <main className="ws-main">
          {children}
        </main>

        <aside className="ws-inspector">
          <p className="ws-inspector-title">INSPECTOR</p>
          <div className="ws-inspector-empty">
            Select an artifact to view details
          </div>
        </aside>
      </div>

      <footer className="ws-dock">
        <div className="ws-dock-item">Add Media</div>
        <div className="ws-dock-item">Generate</div>
        <div className="ws-dock-item">Publish Handoff</div>
      </footer>
    </div>
  );
};
