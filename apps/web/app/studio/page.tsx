import type { Metadata } from "next";
import { EnochTopNav } from "../../components/enoch/enoch-top-nav";
import { StudioCanvas } from "../../components/workspace/studio-canvas";
import { getEnochEnvValue } from "../../lib/server/enoch-env";
import { runProjectCreationPreflight } from "../../lib/server/live-runtime-preflight";
import { listRecentProjects } from "../../lib/server/projects-index";

export const metadata: Metadata = {
  title: "Studio",
  description: "Shape ideas, artifacts, and route decisions around a live Project Enoch workflow."
};

const formatProviderLabel = (provider: string | undefined) => {
  switch (provider) {
    case "claude":
      return "Claude";
    case "gemini":
      return "Gemini";
    case "openai":
      return "OpenAI";
    default:
      return "Enoch";
  }
};

export default async function StudioPage() {
  const [projectsResult, creationReadiness] = await Promise.all([
    listRecentProjects(10),
    runProjectCreationPreflight()
  ]);

  return (
    <main className="studio-page-shell">
      <EnochTopNav currentRoute="studio" />
      <StudioCanvas
        projectsResult={projectsResult}
        creationReadiness={creationReadiness}
        enochProviderLabel={formatProviderLabel(getEnochEnvValue("PROVIDER"))}
      />
    </main>
  );
}
