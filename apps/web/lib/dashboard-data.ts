import type { AspectRatio, JobStatus, Platform, ProjectTone, ProviderName, WorkflowStage } from "@content-engine/shared";

type DemoScene = {
  id: string;
  title: string;
  narration: string;
  visualBeat: string;
  durationSeconds: number;
  status: JobStatus;
};

type DemoClip = {
  id: string;
  sceneId: string;
  status: JobStatus;
  providerJobId: string | null;
  duration: number;
};

type DemoProject = {
  id: string;
  name: string;
  status: JobStatus;
  currentStage: WorkflowStage;
  provider: ProviderName;
  durationSeconds: number;
  aspectRatio: AspectRatio;
  platforms: Platform[];
  tone: ProjectTone;
  brief: {
    objective: string;
    audience: string;
    rawBrief: string;
  };
  concept: {
    hook: string;
    thesis: string;
    cta: string;
  };
  scenes: DemoScene[];
  clips: DemoClip[];
  render: {
    status: JobStatus;
    operations: string[];
  };
  publish: {
    title: string;
    caption: string;
    hashtags: string[];
    scheduledPublishTime: string;
  };
};

export const demoProject: DemoProject = {
  id: "c9a85d44-b5d2-4b3e-8574-845170a5d351",
  name: "Revenue Ops Content Sprint",
  status: "awaiting_approval" as JobStatus,
  currentStage: "qc_decision" as WorkflowStage,
  provider: "sora",
  durationSeconds: 20,
  aspectRatio: "9:16",
  platforms: ["tiktok", "instagram_reels", "youtube_shorts"],
  tone: "authority",
  brief: {
    objective: "Turn one sales-ops insight into a 20 second retention-first video.",
    audience: "B2B operators",
    rawBrief:
      "Explain why manual reporting is slowing teams down and show how automation compresses turnaround without adding chaos."
  },
  concept: {
    hook: "Manual reporting is costing your team more than the dashboard license ever will.",
    thesis: "Tight systems beat heroic effort every time.",
    cta: "Save this for your next revenue ops planning session."
  },
  scenes: [
    {
      id: "scene-1",
      title: "The drag",
      narration: "Manual reporting burns hours before the real work even starts.",
      visualBeat: "A chaotic spreadsheet stack collapsing into a clean dashboard.",
      durationSeconds: 5,
      status: "approved" as JobStatus
    },
    {
      id: "scene-2",
      title: "The shift",
      narration: "Automation gives ops teams clean signals fast enough to act on.",
      visualBeat: "Metrics flow into a bright, organized command center.",
      durationSeconds: 5,
      status: "approved" as JobStatus
    },
    {
      id: "scene-3",
      title: "The proof",
      narration: "Faster insight means faster decisions and fewer executive surprises.",
      visualBeat: "A team reviews a concise KPI board and aligns instantly.",
      durationSeconds: 5,
      status: "approved" as JobStatus
    },
    {
      id: "scene-4",
      title: "The CTA",
      narration: "Build the system once, then let the content machine compound.",
      visualBeat: "Brand end frame with a decisive call to action.",
      durationSeconds: 5,
      status: "pending" as JobStatus
    }
  ],
  clips: [
    { id: "clip-1", sceneId: "scene-1", status: "completed" as JobStatus, providerJobId: "vid_1", duration: 4 },
    { id: "clip-2", sceneId: "scene-2", status: "completed" as JobStatus, providerJobId: "vid_2", duration: 4 },
    { id: "clip-3", sceneId: "scene-3", status: "queued" as JobStatus, providerJobId: "vid_3", duration: 4 },
    { id: "clip-4", sceneId: "scene-4", status: "pending" as JobStatus, providerJobId: null, duration: 4 }
  ],
  render: {
    status: "pending" as JobStatus,
    operations: ["normalize_clips", "stitch_concat", "burn_captions", "overlay_logo", "insert_end_card", "mix_music_bed", "extract_thumbnail"]
  },
  publish: {
    title: "Why manual reporting is draining revenue ops",
    caption: "Short-form explainer cut for operators who need signal fast.",
    hashtags: ["#revops", "#shortformvideo", "#contentops"],
    scheduledPublishTime: "2026-03-18T14:00:00-04:00"
  }
};

export const stageLabels: Record<WorkflowStage, string> = {
  brief_intake: "Brief Intake",
  concept_generation: "Concept Generation",
  trend_research: "Trend Research",
  scene_planning: "Scene Planning",
  script_validation: "Script Validation",
  prompt_creation: "Prompt Builder",
  clip_generation: "Clip Generation",
  qc_decision: "QC / Approval",
  render_assembly: "Render Assembly",
  asset_persistence: "Asset Persistence",
  publish_payload: "Publish Handoff"
};
