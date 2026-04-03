import type { ReactNode } from "react";
import Link from "next/link";

export const WorkspaceLayout = ({
  children,
  toolbarTitle,
  toolbarCenter,
  toolbarActions,
  sidebar,
  inspector,
  footer
}: {
  children: ReactNode;
  toolbarTitle: string;
  toolbarCenter: ReactNode;
  toolbarActions: ReactNode;
  sidebar: ReactNode;
  inspector: ReactNode;
  footer: ReactNode;
}) => {
  return (
    <div className="ws-layout">
      <header className="ws-toolbar">
        <div className="ws-toolbar-left">
          <Link href="/" className="ws-brand" prefetch={false}>
            ADAM
          </Link>
          <span className="ws-divider">/</span>
          <span className="ws-title">{toolbarTitle}</span>
        </div>

        <div className="ws-toolbar-center" aria-label="Canvas guidance">
          {toolbarCenter}
        </div>

        <div className="ws-toolbar-right">{toolbarActions}</div>
      </header>

      <div className="ws-body">
        <aside className="ws-sidebar">{sidebar}</aside>

        <main className="ws-main">{children}</main>

        <aside className="ws-inspector">{inspector}</aside>
      </div>

      <footer className="ws-dock">{footer}</footer>
    </div>
  );
};
