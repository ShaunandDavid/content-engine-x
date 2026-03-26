import { AdamTopNav } from "../../components/adam/adam-top-nav";
import { StudioCanvas } from "../../components/workspace/studio-canvas";
import { runProjectCreationPreflight } from "../../lib/server/live-runtime-preflight";
import { listRecentProjects } from "../../lib/server/projects-index";

const formatProviderLabel = (provider: string | undefined) => {
  switch (provider) {
    case "claude":
      return "Claude";
    case "gemini":
      return "Gemini";
    case "openai":
      return "OpenAI";
    default:
      return "Adam";
  }
};

export default async function StudioPage() {
  const [projectsResult, creationReadiness] = await Promise.all([
    listRecentProjects(10),
    runProjectCreationPreflight()
  ]);

  return (
    <main className="studio-page-shell">
      <AdamTopNav currentRoute="studio" />
      <StudioCanvas
        projectsResult={projectsResult}
        creationReadiness={creationReadiness}
        adamProviderLabel={formatProviderLabel(process.env.ADAM_PROVIDER)}
      />
    </main>
  );
}
