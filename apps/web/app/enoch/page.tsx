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
    <main className="min-h-screen bg-background">
      <EnochTopNav currentRoute="assistant" />
      <EnochAssistantWorkspace initialData={data} />
    </main>
  );
}
