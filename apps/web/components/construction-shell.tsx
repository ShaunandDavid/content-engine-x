import Link from "next/link";

import { dashboardRoute } from "../lib/routes";

export const ConstructionShell = ({ moduleName }: { moduleName: string }) => {
  return (
    <div className="construction-layout">
      <div className="construction-card">
        <div className="construction-icon" aria-hidden="true">
          <span />
        </div>
        <span className="eyebrow construction-card__eyebrow">Coming Online</span>
        <h1>{moduleName} is not live yet</h1>
        <p>This route is reserved for a future Content Engine X module. The live Project Enoch pipeline is available now.</p>
        <Link href={dashboardRoute} className="button" prefetch={false}>
          Back to Pipeline
        </Link>
      </div>
    </div>
  );
};
