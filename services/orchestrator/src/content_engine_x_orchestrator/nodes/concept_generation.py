from __future__ import annotations

import logging

from ..ai_caller import call_ai
from ..memory.brain_retriever import retrieve_for_concept_generation
from ..models import JobStatus, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt

logger = logging.getLogger(__name__)

CONCEPT_SYSTEM_PROMPT_BASE = """You are an expert short-form video content strategist for Enoch.
Given a creative brief, generate a single video concept optimized for virality on TikTok, Instagram Reels, and YouTube Shorts.

Respond ONLY with a JSON object containing exactly these keys:
{
  "title": "Compelling video title (max 10 words)",
  "hook": "Opening hook that stops the scroll in the first 2 seconds (one sentence)",
  "thesis": "The single core insight or message the video delivers (one sentence)",
  "visual_direction": "Visual style, pacing, and motion direction for the video (one sentence)",
  "cta": "Call to action for the end of the video (one sentence)"
}

Rules:
- The hook MUST create a curiosity gap or pattern interrupt
- The thesis MUST deliver a specific, concrete insight (not generic advice)
- The CTA MUST be specific and actionable (not "follow for more")
- Match the tone specified in the brief
- No generic filler. Every word earns its place.
"""

CONCEPT_MEMORY_INJECTION = """

{memory_context}

Apply these past learnings when generating the concept. Do not repeat patterns that were rejected.
Reinforce patterns that were approved. If memory shows a hook style worked before, use a variant.
"""


def concept_generation_node(state: WorkflowState) -> WorkflowState:
    brief = state["brief"]
    project_config = state["project_config"]
    project_id = str(state.get("project_id", ""))

    retrieval = None
    memory_context = ""
    retrieval_path = "none"
    try:
        retrieval = retrieve_for_concept_generation(
            brief=brief,
            project_config=project_config,
            project_id=project_id or None,
        )
        retrieval_path = retrieval.retrieval_path
        memory_context = retrieval.context_summary
        if memory_context:
            logger.info(
                "node.concept_generation | memory_path=%s candidates=%d project=%s",
                retrieval_path,
                retrieval.total_candidates,
                project_id,
            )
    except Exception as exc:
        logger.warning("concept_generation: brain retrieval failed (non-fatal): %s", exc)

    system_prompt = CONCEPT_SYSTEM_PROMPT_BASE
    if memory_context:
        system_prompt += CONCEPT_MEMORY_INJECTION.format(memory_context=memory_context)

    # Inject brand context
    brand_block = state.get("brand_context_block", "")
    if brand_block:
        system_prompt += f"\n\n{brand_block}\n"
        system_prompt += "\nGenerate a concept that is unmistakably ON-BRAND for the above identity.\n"

    user_prompt = (
        f"Brief title: {brief.get('title', 'Untitled')}\n"
        f"Objective: {brief.get('objective', 'Drive awareness')}\n"
        f"Target audience: {brief.get('audience', 'busy professionals')}\n"
        f"Raw brief: {brief.get('raw_brief', '')}\n"
        f"Tone: {project_config.get('tone', 'authority')}\n"
        f"Platforms: {', '.join(project_config.get('platforms', ['tiktok']))}\n"
        f"Duration: {project_config.get('duration_seconds', 15)} seconds"
    )

    ai_generated = True
    try:
        concept = call_ai(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.8,
            max_tokens=500,
            required_keys=["title", "hook", "thesis", "visual_direction", "cta"],
        )
        logger.info(
            "node.%s | ai_generated=True memory_path=%s project=%s",
            WorkflowStage.CONCEPT_GENERATION.value,
            retrieval_path,
            project_id,
        )
    except Exception as exc:
        logger.warning("AI concept generation failed, using fallback: %s", exc)
        ai_generated = False
        tone = project_config.get("tone", "authority")
        objective = brief.get("objective", "Drive awareness")
        audience = brief.get("audience", "busy professionals")
        project_name = project_config.get("project_name") or brief.get("title") or "Untitled Project"
        concept = {
            "title": f"{project_name}: {objective}",
            "hook": f"Stop scrolling: here is the fastest path to {objective.lower()}.",
            "thesis": f"Deliver one high-conviction insight for {audience}.",
            "visual_direction": f"{tone} pacing, punchy motion, clean brand framing.",
            "cta": "Save this and send it to the teammate who needs it.",
        }

    return {
        "current_stage": WorkflowStage.CONCEPT_GENERATION.value,
        "concept": concept,
        "stage_attempts": append_stage_attempt(
            state,
            WorkflowStage.CONCEPT_GENERATION,
            JobStatus.COMPLETED,
        ),
        "audit_log": append_audit_event(
            state,
            action="concept.generated",
            entity_type="project",
            stage=WorkflowStage.CONCEPT_GENERATION,
            entity_id=state["project_id"],
            metadata={
                "hook": concept["hook"],
                "ai_generated": ai_generated,
                "memory_path": retrieval_path,
                "memory_candidates": retrieval.total_candidates if retrieval else 0,
            },
        ),
    }
