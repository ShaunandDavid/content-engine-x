import { randomUUID } from "node:crypto";

import type {
  AdamModelRoutingDecision,
  AdamPlanningArtifact,
  AdamReasoningArtifact,
  AdamTextPlanningInput,
  NormalizedIntake,
  ProjectBriefInput,
  PromptDraft,
  PromptGenerationBundle,
  PromptGenerationInput,
  ScenePlanDraft
} from "@content-engine/shared";
import {
  normalizedIntakeSchema,
  promptDraftSchema,
  promptGenerationBundleSchema,
  promptGenerationInputSchema
} from "@content-engine/shared";

const normalizeGoal = (input: { goal?: string | null; idea: string }) => {
  if (input.goal?.trim()) {
    return input.goal.trim();
  }

  const trimmedIdea = input.idea.trim();
  if (trimmedIdea.length <= 140) {
    return trimmedIdea;
  }

  const sentence = trimmedIdea.split(/[.!?]/).find((part) => part.trim().length >= 10);
  return (sentence ?? trimmedIdea.slice(0, 140)).trim();
};

const buildOfferOrConcept = (input: { offer?: string | null; idea: string }) => {
  if (input.offer?.trim()) {
    return input.offer.trim();
  }

  const compactIdea = input.idea.trim().replace(/\s+/g, " ");
  return compactIdea.length <= 120 ? compactIdea : `${compactIdea.slice(0, 117).trim()}...`;
};

const classifyRequest = (input: { idea: string; goal?: string | null; offer?: string | null }) => {
  const classifierSource = [input.idea, input.goal ?? "", input.offer ?? ""].join(" ").toLowerCase();

  if (/(campaign|launch|brief|funnel|position)/.test(classifierSource)) {
    return "campaign_planning" as const;
  }

  if (/(offer|product|service|pricing|solution)/.test(classifierSource)) {
    return "offer_positioning" as const;
  }

  if (/(audience|buyer|customer|persona|segment)/.test(classifierSource)) {
    return "audience_strategy" as const;
  }

  return "content_direction" as const;
};

const buildAssumptionsOrUnknowns = (input: {
  goal?: string | null;
  offer?: string | null;
  constraints: string[];
  audience: string;
  platforms: string[];
}) => {
  const assumptions: string[] = [];

  if (!input.goal?.trim()) {
    assumptions.push("The core operator goal is inferred from the idea because no explicit goal was provided.");
  }

  if (!input.offer?.trim()) {
    assumptions.push("The offer or concept is inferred from the idea because no explicit offer was supplied.");
  }

  if (input.constraints.length === 0) {
    assumptions.push("No explicit constraints were supplied, so brand and approval guardrails may need confirmation.");
  }

  if (/general audience/i.test(input.audience)) {
    assumptions.push("The audience is broad and may need tighter segmentation before execution.");
  }

  if (input.platforms.length === 1) {
    assumptions.push(`The plan is optimized around ${input.platforms[0]} first and may need adaptation for additional channels.`);
  }

  return assumptions;
};

const getSceneDurations = (durationSeconds: number) => {
  if (durationSeconds === 15) {
    return [5, 5, 5];
  }

  if (durationSeconds === 20) {
    return [5, 5, 5, 5];
  }

  return [7, 8, 7, 8];
};

export const normalizeAdamPlanningInput = (input: {
  sourceType: NormalizedIntake["source"]["sourceType"];
  payload: AdamTextPlanningInput;
  routingDecision: AdamModelRoutingDecision;
}): NormalizedIntake => {
  const coreGoal = normalizeGoal({
    goal: input.payload.goal,
    idea: input.payload.idea
  });
  const offerOrConcept = buildOfferOrConcept({
    offer: input.payload.offer,
    idea: input.payload.idea
  });
  const requestClassification = classifyRequest({
    idea: input.payload.idea,
    goal: input.payload.goal,
    offer: input.payload.offer
  });
  const assumptionsOrUnknowns = buildAssumptionsOrUnknowns({
    goal: input.payload.goal,
    offer: input.payload.offer,
    constraints: input.payload.constraints,
    audience: input.payload.audience,
    platforms: input.payload.platforms
  });
  const recommendedAngle = `${input.payload.tone} operator brief that frames ${offerOrConcept.toLowerCase()} as the clearest path to ${coreGoal.toLowerCase()} for ${input.payload.audience.toLowerCase()}.`;
  const nextStepPlanningSummary = `Turn this into a campaign brief with one primary promise, three proof points, and one channel-first execution path for ${input.payload.platforms.join(", ")}. Lead with ${recommendedAngle} Resolve the key unknowns first: ${assumptionsOrUnknowns.length > 0 ? assumptionsOrUnknowns.join(" ") : "No major unknowns were identified in the intake."}`;

  return normalizedIntakeSchema.parse({
    source: {
      sourceType: input.sourceType,
      rawIdea: input.payload.idea.trim()
    },
    intent: {
      projectName: input.payload.projectName,
      coreGoal,
      audience: input.payload.audience,
      offerOrConcept,
      constraints: input.payload.constraints,
      tone: input.payload.tone
    },
    delivery: {
      platforms: input.payload.platforms,
      durationSeconds: input.payload.durationSeconds,
      aspectRatio: input.payload.aspectRatio,
      videoProvider: input.payload.provider
    },
    planning: {
      requestClassification,
      reasoningSummary: `Treat this as ${requestClassification.replace(/_/g, " ")} work: anchor on ${coreGoal.toLowerCase()}, use ${offerOrConcept.toLowerCase()} as the working concept, and pressure-test assumptions before turning it into channel execution.`,
      assumptionsOrUnknowns,
      recommendedAngle,
      nextStepPlanningSummary
    },
    routing: {
      planningProvider: input.routingDecision.provider,
      planningModel: input.routingDecision.model,
      taskType: input.routingDecision.taskType,
      decisionReason: input.routingDecision.routingReason
    }
  });
};

export const buildNormalizedIntakeFromProjectBrief = (input: {
  payload: ProjectBriefInput;
  routingDecision: AdamModelRoutingDecision;
  adamPlanningArtifact?: AdamPlanningArtifact | null;
  adamReasoningArtifact?: AdamReasoningArtifact | null;
}): NormalizedIntake => {
  const normalizedFromBrief = normalizeAdamPlanningInput({
    sourceType: "project_brief",
    payload: {
      projectName: input.payload.projectName,
      idea: input.payload.rawBrief,
      goal: input.payload.objective,
      audience: input.payload.audience,
      constraints: input.payload.guardrails,
      tone: input.payload.tone,
      platforms: input.payload.platforms,
      durationSeconds: input.payload.durationSeconds as 15 | 20 | 30,
      aspectRatio: input.payload.aspectRatio,
      provider: input.payload.provider
    },
    routingDecision: input.routingDecision
  });

  if (!input.adamPlanningArtifact) {
    return normalizedFromBrief;
  }

  return normalizedIntakeSchema.parse({
    ...normalizedFromBrief,
    intent: {
      ...normalizedFromBrief.intent,
      coreGoal: input.adamPlanningArtifact.normalizedUserGoal,
      audience: input.adamPlanningArtifact.audience,
      offerOrConcept: input.adamPlanningArtifact.offerOrConcept,
      constraints: input.adamPlanningArtifact.constraints
    },
    planning: {
      requestClassification:
        input.adamReasoningArtifact?.reasoning.requestClassification ?? normalizedFromBrief.planning.requestClassification,
      reasoningSummary:
        input.adamReasoningArtifact?.reasoning.reasoningSummary ?? normalizedFromBrief.planning.reasoningSummary,
      assumptionsOrUnknowns:
        input.adamReasoningArtifact?.reasoning.assumptionsOrUnknowns ?? normalizedFromBrief.planning.assumptionsOrUnknowns,
      recommendedAngle: input.adamPlanningArtifact.recommendedAngle,
      nextStepPlanningSummary: input.adamPlanningArtifact.nextStepPlanningSummary
    }
  });
};

export const buildPromptGenerationInput = (intake: NormalizedIntake): PromptGenerationInput =>
  promptGenerationInputSchema.parse({
    projectName: intake.intent.projectName,
    coreGoal: intake.intent.coreGoal,
    audience: intake.intent.audience,
    offerOrConcept: intake.intent.offerOrConcept,
    constraints: intake.intent.constraints,
    tone: intake.intent.tone,
    platforms: intake.delivery.platforms,
    durationSeconds: intake.delivery.durationSeconds,
    aspectRatio: intake.delivery.aspectRatio,
    videoProvider: intake.delivery.videoProvider,
    requestClassification: intake.planning.requestClassification,
    reasoningSummary: intake.planning.reasoningSummary,
    recommendedAngle: intake.planning.recommendedAngle,
    nextStepPlanningSummary: intake.planning.nextStepPlanningSummary,
    planningProvider: intake.routing.planningProvider,
    planningModel: intake.routing.planningModel
  });

export const buildPromptGenerationBundle = (input: PromptGenerationInput): PromptGenerationBundle => {
  const concept = {
    title: `${input.projectName}: ${input.coreGoal}`,
    hook: `Stop scrolling: ${input.recommendedAngle}`,
    thesis: input.nextStepPlanningSummary,
    visualDirection: `${input.tone} pacing, high-contrast frames, clear motion hierarchy. Build around ${input.offerOrConcept.toLowerCase()} and keep the angle operator-ready.`,
    cta: `Save this and send it to someone working on ${input.coreGoal.toLowerCase()}.`
  };

  const scenes: ScenePlanDraft[] = getSceneDurations(input.durationSeconds).map((sceneDuration, index, durations) => ({
    sceneId: randomUUID(),
    ordinal: index + 1,
    title: index === 0 ? "Hook" : index === durations.length - 1 ? "Close" : `Beat ${index + 1}`,
    visualBeat:
      index === 0
        ? `${concept.visualDirection} Open with a visually arresting frame that makes the pain obvious.`
        : `${concept.visualDirection} Build the story with one concrete proof point for ${input.audience}.`,
    narration:
      index === 0
        ? concept.hook
        : index === durations.length - 1
          ? concept.cta
          : `Push the thesis forward with one specific argument tied to ${input.coreGoal.toLowerCase()}.`,
    durationSeconds: sceneDuration,
    aspectRatio: input.aspectRatio
  }));

  const prompts: PromptDraft[] = scenes.map((scene) =>
    promptDraftSchema.parse({
      id: randomUUID(),
      sceneId: scene.sceneId,
      systemPrompt:
        "You are generating a short-form social video shot prompt. Keep framing intentional, readable, cinematic, and optimized for retention.",
      userPrompt:
        `Create a ${scene.durationSeconds} second ${scene.aspectRatio} scene. ` +
        `Scene title: ${scene.title}. Visual beat: ${scene.visualBeat}. Narration intent: ${scene.narration}. ` +
        `Tone: ${input.tone}. Platforms: ${input.platforms.join(", ")}.`,
      compiledPrompt:
        `Campaign thesis: ${concept.thesis}\n` +
        `Reasoning summary: ${input.reasoningSummary}\n` +
        `Hook: ${concept.hook}\n` +
        `Scene title: ${scene.title}\n` +
        `Visual beat: ${scene.visualBeat}\n` +
        `Narration intent: ${scene.narration}\n` +
        `Call to action: ${concept.cta}\n` +
        `Guardrails: ${input.constraints.join(" | ") || "Maintain brand-safe, platform-safe output."}`,
      model: input.planningModel
    })
  );

  return promptGenerationBundleSchema.parse({
    concept,
    scenes,
    prompts
  });
};
