from __future__ import annotations

import logging
from uuid import uuid4

from ..ai_caller import call_ai
from ..config import load_settings
from ..memory.brain_retriever import retrieve_for_prompt_creation
from ..models import JobStatus, PromptVersion, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt, utc_now

logger = logging.getLogger(__name__)

MOTION_SCORE_PROMPT = """Given this scene description and video concept, assign a motion score from 1-7:
1 = nearly static (talking head, product shot, minimal movement)
2-3 = subtle motion (slow zoom, gentle pan, light movement)
4 = moderate motion (person walking, gestures, steady cam movement)
5-6 = dynamic motion (fast movement, action, energetic camera work)
7 = high kinetic energy (rapid cuts implied, action, very dynamic)

Respond ONLY with a JSON object:
{
  "motion_score": <integer 1-7>,
  "motion_rationale": "<one sentence why>"
}
"""

PROMPT_SYSTEM = """You are an expert AI video generation prompt engineer specializing in Sora and diffusion video models.

Given a scene description, video concept, and motion score, write a single Sora-optimized video generation prompt.

Respond ONLY with a JSON object:
{
  "prompt": "Your cinematic Sora prompt here"
}

Rules for the prompt:
- Lead with the primary subject and action
- Include specific camera movement matching the motion score:
  * Score 1-2: "slow push in", "static wide shot", "subtle drift"
  * Score 3-4: "smooth tracking shot", "gentle handheld", "deliberate pan"
  * Score 5-6: "dynamic tracking", "energetic handheld", "fast pan"
  * Score 7: "kinetic handheld", "rapid whip pan", "high-energy tracking"
- Specify lighting
- Include mood and color palette
- Reference the visual style and tone from the concept
- Keep it under 120 words
- Do NOT include text overlays or captions
- Do NOT reference brands, logos, or copyrighted content
- Format: [Subject + Action], [Camera Movement matching motion score], [Lighting], [Style/Mood], [Detail]
"""

PROMPT_MEMORY_INJECTION = """

{memory_context}

Use successful past prompt patterns above. Avoid prompt structures that previously failed QC.
"""


def _scene_description(scene: dict[str, object]) -> str:
    parts = [
        str(scene.get("title", "") or ""),
        str(scene.get("visual_beat", "") or ""),
        str(scene.get("narration", "") or ""),
    ]
    return " ".join(part for part in parts if part).strip()


def _rule_based_motion_score(
    scene: dict[str, object],
    concept: dict[str, object],
    project_config: dict[str, object],
) -> tuple[int, str]:
    tone = str(project_config.get("tone", "authority")).lower()
    description = f"{_scene_description(scene)} {concept.get('visual_direction', '')}".lower()
    duration = int(scene.get("duration_seconds", 5) or 5)

    high_energy_words = ["action", "fast", "energy", "dynamic", "quick", "rapid", "intense"]
    static_words = ["talking", "interview", "product", "close-up", "still", "calm", "minimal"]

    high_hits = sum(1 for word in high_energy_words if word in description)
    static_hits = sum(1 for word in static_words if word in description)

    if high_hits >= 2 or tone in {"hype", "energetic", "bold"}:
        return 6, "High-energy tone and action language detected."
    if static_hits >= 2 or tone in {"calm", "educational", "authority"}:
        return 2, "Static or authoritative tone suggests restrained motion."
    if duration <= 3:
        return 5, "Short duration implies faster pacing."
    return 4, "Moderate motion is a safe default for this scene."


def _assign_motion_score(
    scene: dict[str, object],
    concept: dict[str, object],
    project_config: dict[str, object],
) -> tuple[int, str]:
    user_prompt = (
        f"Scene title: {scene.get('title', '')}\n"
        f"Visual beat: {scene.get('visual_beat', '')}\n"
        f"Narration: {scene.get('narration', '')}\n"
        f"Visual direction: {concept.get('visual_direction', '')}\n"
        f"Tone: {project_config.get('tone', 'authority')}\n"
        f"Duration: {scene.get('duration_seconds', 5)}s\n"
        f"Aspect ratio: {scene.get('aspect_ratio', '9:16')}"
    )

    try:
        result = call_ai(
            system_prompt=MOTION_SCORE_PROMPT,
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=100,
            required_keys=["motion_score", "motion_rationale"],
        )
        score = max(1, min(7, int(result["motion_score"])))
        rationale = str(result.get("motion_rationale", "") or "")
        return score, rationale
    except Exception as exc:
        logger.warning("motion score AI call failed, using rule-based fallback: %s", exc)
        return _rule_based_motion_score(scene, concept, project_config)


def _camera_movement_for_score(motion_score: int) -> str:
    if motion_score <= 2:
        return "slow push in"
    if motion_score <= 4:
        return "smooth tracking shot"
    if motion_score <= 6:
        return "dynamic tracking"
    return "kinetic handheld"


def prompt_creation_node(state: WorkflowState) -> WorkflowState:
    settings = load_settings()
    project_config = state["project_config"]
    concept = state["concept"]
    project_id = str(state.get("project_id", ""))

    prompt_versions: list[dict[str, object]] = []
    motion_scores: list[int] = []
    memory_paths: list[str] = []
    ai_generated_count = 0

    for scene in state["scenes"]:
        scene_id = scene["scene_id"]
        motion_score, motion_rationale = _assign_motion_score(scene, concept, project_config)
        motion_scores.append(motion_score)

        retrieval_path = "empty"
        memory_context = ""
        try:
            retrieval = retrieve_for_prompt_creation(
                scene=scene,
                concept=concept,
                project_id=project_id or None,
            )
            retrieval_path = retrieval.retrieval_path
            memory_context = retrieval.context_summary
        except Exception as exc:
            logger.warning("prompt_creation: brain retrieval failed (non-fatal): %s", exc)
        memory_paths.append(retrieval_path)

        system_prompt = PROMPT_SYSTEM
        if memory_context:
            system_prompt += PROMPT_MEMORY_INJECTION.format(memory_context=memory_context)

        motion_label = {
            1: "nearly static",
            2: "subtle motion",
            3: "gentle motion",
            4: "moderate motion",
            5: "dynamic motion",
            6: "energetic motion",
            7: "high kinetic energy",
        }[motion_score]

        hero_key = state.get("hero_image_r2_key")
        i2v_instruction = ""
        if hero_key:
            i2v_instruction = (
                "\nIMPORTANT: This prompt will be used with image-to-video generation. "
                "The reference image establishes the visual anchor for this video. "
                "Your prompt must describe MOTION and ACTION that flows naturally FROM that image. "
                "Describe what MOVES, not what appears — the image handles the visual foundation.\n"
            )

        user_prompt = (
            f"Scene title: {scene.get('title', '')}\n"
            f"Visual beat: {scene.get('visual_beat', '')}\n"
            f"Narration: {scene.get('narration', '')}\n"
            f"Duration: {scene.get('duration_seconds', 5)}s\n"
            f"Aspect ratio: {scene.get('aspect_ratio', '9:16')}\n"
            f"Motion score: {motion_score}/7 ({motion_label})\n"
            f"Hook: {concept.get('hook', '')}\n"
            f"Thesis: {concept.get('thesis', '')}\n"
            f"Visual direction: {concept.get('visual_direction', '')}\n"
            f"Tone: {project_config.get('tone', 'authority')}\n"
            f"Platforms: {', '.join(project_config.get('platforms', ['tiktok']))}"
            f"{i2v_instruction}"
        )

        ai_generated = True
        try:
            result = call_ai(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.75,
                max_tokens=400,
                required_keys=["prompt"],
            )
            compiled_prompt = str(result["prompt"])
            ai_generated_count += 1
        except Exception as exc:
            logger.warning("AI prompt creation failed for scene %s, using fallback: %s", scene_id, exc)
            ai_generated = False
            compiled_prompt = (
                f"{scene.get('title', 'Scene')} - {scene.get('visual_beat', 'Subject in frame')}. "
                f"Voiceover intent: {scene.get('narration', '')}. "
                f"Camera: {_camera_movement_for_score(motion_score)}. "
                f"Lighting: cinematic, polished social-video production. "
                f"Style: {concept.get('visual_direction', 'clean cinematic style')}. "
                f"Aspect ratio {scene.get('aspect_ratio', '9:16')}."
            )

        prompt_version = PromptVersion(
            prompt_id=str(uuid4()),
            scene_id=scene_id,
            stage=WorkflowStage.PROMPT_CREATION,
            version=1,
            provider=str(project_config["provider"]),
            model=settings.openai_sora_model if ai_generated else "template",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            compiled_prompt=compiled_prompt,
            created_at=utc_now(),
        ).model_dump(mode="json")
        prompt_version["motion_score"] = motion_score
        prompt_version["motion_rationale"] = motion_rationale
        prompt_version["ai_generated"] = ai_generated
        prompt_version["memory_path"] = retrieval_path
        prompt_version["reference_image_r2_key"] = hero_key
        prompt_version["generation_mode"] = "i2v" if hero_key else "t2v"
        prompt_versions.append(prompt_version)

        logger.info(
            "node.prompt_creation | scene=%s motion_score=%d memory_path=%s project=%s",
            scene_id,
            motion_score,
            retrieval_path,
            project_id,
        )

    return {
        "current_stage": WorkflowStage.PROMPT_CREATION.value,
        "prompt_versions": prompt_versions,
        "stage_attempts": append_stage_attempt(
            state,
            WorkflowStage.PROMPT_CREATION,
            JobStatus.COMPLETED,
        ),
        "audit_log": append_audit_event(
            state,
            action="prompts.created",
            entity_type="prompt",
            stage=WorkflowStage.PROMPT_CREATION,
            metadata={
                "prompt_count": len(prompt_versions),
                "ai_generated_count": ai_generated_count,
                "motion_scores": motion_scores,
                "memory_paths": memory_paths,
            },
        ),
    }
