import type { Metadata } from "next";

import { EnochAssistantWorkspace } from "../../components/enoch/enoch-assistant-workspace";
import { EnochTopNav } from "../../components/enoch/enoch-top-nav";
import { loadEnochAssistantPageData } from "../../lib/server/enoch-assistant-data";

export const metadata: Metadata = {
  title: "Enoch Assistant",
  description: "Dedicated assistant workspace for Enoch conversation history, project context, scene generation, and Workspace export."
};

const normalizeQueryValue = (value: string | string[] | undefined) => (typeof value === "string" && value.trim() ? value.trim() : null);

export default async function EnochAssistantPage({
  searchParams
}: {
  searchParams?: Promise<{
    sessionId?: string | string[];
    projectId?: string | string[];
  }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const data = await loadEnochAssistantPageData({
    sessionId: normalizeQueryValue(resolvedSearchParams.sessionId),
    projectId: normalizeQueryValue(resolvedSearchParams.projectId)
  });

  return (
    <main className="min-h-screen bg-[#040404] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[920px] bg-[radial-gradient(circle_at_18%_16%,rgba(94,234,212,0.14),transparent_18%),radial-gradient(circle_at_78%_12%,rgba(168,85,247,0.2),transparent_18%),linear-gradient(180deg,#040404_0%,#05070b_55%,#040404_100%)]" />
      <EnochTopNav currentRoute="assistant" />
      <EnochAssistantWorkspace initialData={data} />
    </main>
  );
}
