from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
import time
from pathlib import Path
from uuid import uuid4

from ..config import load_settings
from ..models import ClipRequest, JobStatus, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt

logger = logging.getLogger(__name__)

INITIAL_SEGMENT_SECONDS = (4, 8, 12)
TONE_STYLE_MAP = {
    "authority": "documentary",
    "cinematic": "cinematic",
    "educational": "documentary",
    "energetic": "ad-promo",
    "playful": "uplifting",
}
ASPECT_PLATFORM_MAP = {
    "9:16": "tiktok-reels-shorts",
    "16:9": "youtube-horizontal",
}
FORMAT_BY_MODEL_AND_ASPECT = {
    "sora-2": {
        "9:16": "720x1280",
        "16:9": "1280x720",
    },
    "sora-2-pro": {
        "9:16": "1024x1792",
        "16:9": "1792x1024",
    },
}

_bridge_ready = False


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[5]


def _bridge_path() -> Path:
    return _repo_root() / "services" / "providers" / "sora" / "dist" / "bridge.js"


def _nearest_duration(duration_seconds: int, allowed: tuple[int, ...] = INITIAL_SEGMENT_SECONDS) -> int:
    return min(allowed, key=lambda candidate: abs(candidate - duration_seconds))


def _style_for_tone(tone: object) -> str:
    return TONE_STYLE_MAP.get(str(tone).lower(), "documentary")


def _platform_preset_for_aspect_ratio(aspect_ratio: object) -> str:
    return ASPECT_PLATFORM_MAP.get(str(aspect_ratio), "tiktok-reels-shorts")


def _format_for_model_and_aspect_ratio(model: str, aspect_ratio: object) -> str:
    aspect_key = str(aspect_ratio)
    if model in FORMAT_BY_MODEL_AND_ASPECT and aspect_key in FORMAT_BY_MODEL_AND_ASPECT[model]:
        return FORMAT_BY_MODEL_AND_ASPECT[model][aspect_key]
    return "720x1280" if aspect_key == "9:16" else "1280x720"


def _resolve_generation_model(prompt: dict[str, object], settings) -> str:
    prompt_model = str(prompt.get("model", "") or "")
    if prompt_model in {"sora-2", "sora-2-pro"}:
        return prompt_model
    return settings.openai_sora_model


def _build_reference_assets(state: WorkflowState, prompt: dict[str, object]) -> list[dict[str, str]] | None:
    hero_image_key = str(
        prompt.get("reference_image_r2_key")
        or state.get("hero_image_r2_key")
        or ""
    ).strip()
    r2_public_url = str(os.environ.get("R2_PUBLIC_URL", "")).strip()

    if not hero_image_key or not r2_public_url:
        return None

    return [{"url": f"{r2_public_url.rstrip('/')}/{hero_image_key.lstrip('/')}"}]


def _ensure_bridge_built() -> Path:
    global _bridge_ready

    bridge = _bridge_path()
    if bridge.exists():
        _bridge_ready = True
        return bridge

    repo_root = _repo_root()
    result = subprocess.run(
        ["corepack", "pnpm", "--filter", "@content-engine/sora-provider", "build"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "Failed to build the Sora bridge for the orchestrator.\n"
            f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )

    if not bridge.exists():
        raise RuntimeError(f"Sora bridge was built but {bridge} was not created.")

    _bridge_ready = True
    return bridge


def _run_bridge(command: str, payload: dict[str, object]) -> dict[str, object]:
    bridge = _ensure_bridge_built()
    result = subprocess.run(
        ["node", str(bridge), command],
        cwd=_repo_root(),
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        check=False,
    )

    if result.returncode != 0:
        error_payload = result.stderr.strip() or result.stdout.strip() or f"Sora bridge command {command} failed."
        try:
            parsed_error = json.loads(error_payload)
            if isinstance(parsed_error, dict):
                message = str(parsed_error.get("message") or parsed_error)
            else:
                message = str(parsed_error)
        except json.JSONDecodeError:
            message = error_payload
        raise RuntimeError(f"Sora bridge {command} failed: {message}")

    stdout = result.stdout.strip()
    if not stdout:
        return {}

    parsed = json.loads(stdout)
    if not isinstance(parsed, dict):
        raise RuntimeError(f"Sora bridge {command} returned a non-object payload: {stdout}")
    return parsed


def _resolve_duration_plan(
    *,
    prompt_text: str,
    requested_duration_seconds: int,
    platform_preset: str,
    style: str,
) -> dict[str, object]:
    return _run_bridge(
        "resolve-duration",
        {
            "roughIdea": prompt_text,
            "platformPreset": platform_preset,
            "style": style,
            "requestedDuration": requested_duration_seconds,
        },
    )


def _plan_segment_prompts(
    *,
    prompt_text: str,
    total_duration: int,
    execution_plan: list[int],
    platform_preset: str,
    style: str,
    model: str,
    format_id: str,
) -> dict[str, object]:
    if len(execution_plan) <= 1:
        return {
            "masterPrompt": prompt_text,
            "segmentPrompts": [prompt_text],
            "promptPlan": None,
        }

    prompt_plan = _run_bridge(
        "plan-prompts",
        {
            "roughIdea": prompt_text,
            "platformPreset": platform_preset,
            "format": format_id,
            "totalDuration": total_duration,
            "executionPlan": execution_plan,
            "style": style,
            "avoidList": [],
            "selectedModel": model,
            "plannerMode": "standard",
        },
    )

    return {
        "masterPrompt": str(prompt_plan.get("masterPrompt", prompt_text)),
        "segmentPrompts": [
            str(prompt_plan.get("initialPrompt", prompt_text)),
            *[str(item) for item in prompt_plan.get("extensionPrompts", [])],
        ],
        "promptPlan": prompt_plan,
    }


def _download_target_path(state: WorkflowState, clip_id: str) -> Path:
    workflow_run_id = str(state.get("workflow_run_id") or state.get("run_id") or "adhoc-run")
    target_dir = Path(tempfile.gettempdir()) / "content-engine-x-orchestrator" / workflow_run_id
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir / f"{clip_id}.mp4"


def _provider_status_to_job_status(status: str) -> JobStatus:
    mapping = {
        "queued": JobStatus.QUEUED,
        "running": JobStatus.RUNNING,
        "completed": JobStatus.COMPLETED,
        "failed": JobStatus.FAILED,
    }
    return mapping.get(status, JobStatus.FAILED)


def clip_generation_node(state: WorkflowState) -> WorkflowState:
    settings = load_settings()
    project_config = state["project_config"]
    prompts_by_scene = {prompt["scene_id"]: prompt for prompt in state["prompt_versions"]}

    clip_requests: list[dict[str, object]] = []
    missing_prompt_scenes: list[int] = []
    completed_generation_summaries: list[dict[str, object]] = []
    total_segments_rendered = 0

    for scene in state["scenes"]:
        prompt = prompts_by_scene.get(scene["scene_id"])
        if not prompt:
            missing_prompt_scenes.append(int(scene["ordinal"]))
            continue

        compiled_prompt = str(prompt["compiled_prompt"])
        aspect_ratio = str(scene["aspect_ratio"])
        requested_duration_seconds = int(scene["duration_seconds"])
        platform_preset = _platform_preset_for_aspect_ratio(aspect_ratio)
        style = _style_for_tone(project_config.get("tone"))
        model = _resolve_generation_model(prompt, settings)
        format_id = _format_for_model_and_aspect_ratio(model, aspect_ratio)
        reference_assets = _build_reference_assets(state, prompt)
        generation_mode = str(prompt.get("generation_mode", "i2v" if reference_assets else "t2v"))

        duration_resolution = _resolve_duration_plan(
            prompt_text=compiled_prompt,
            requested_duration_seconds=requested_duration_seconds,
            platform_preset=platform_preset,
            style=style,
        )
        execution_plan = [int(seconds) for seconds in duration_resolution["segmentPlan"]["segments"]]
        prompt_plan_details = _plan_segment_prompts(
            prompt_text=compiled_prompt,
            total_duration=int(duration_resolution["totalDuration"]),
            execution_plan=execution_plan,
            platform_preset=platform_preset,
            style=style,
            model=model,
            format_id=format_id,
        )
        segment_prompts = [str(segment_prompt) for segment_prompt in prompt_plan_details["segmentPrompts"]]

        clip_id = str(uuid4())
        clip_request = ClipRequest(
            clip_id=clip_id,
            scene_id=scene["scene_id"],
            prompt_id=prompt["prompt_id"],
            provider=project_config["provider"],
            prompt=compiled_prompt,
            requested_duration_seconds=requested_duration_seconds,
            aspect_ratio=aspect_ratio,
            style_preset=str(project_config.get("tone", "")) or None,
            status=JobStatus.RUNNING,
            metadata={
                "duration_recommendation": duration_resolution.get("recommendation"),
                "execution_plan": execution_plan,
                "resolved_duration_seconds": int(duration_resolution["totalDuration"]),
                "platform_preset": platform_preset,
                "format": format_id,
                "provider_model": model,
                "generation_mode": generation_mode,
                "reference_assets": reference_assets or [],
                "master_prompt": prompt_plan_details["masterPrompt"],
                "prompt_plan": prompt_plan_details["promptPlan"],
                "segment_history": [],
            },
        ).model_dump(mode="json")

        source_video_id: str | None = None
        segment_history: list[dict[str, object]] = []

        for segment_index, segment_seconds in enumerate(execution_plan):
            segment_kind = "initial" if segment_index == 0 else "extension"
            segment_prompt = segment_prompts[segment_index] if segment_index < len(segment_prompts) else compiled_prompt
            generation_payload: dict[str, object] = {
                "provider": project_config["provider"],
                "projectId": state["project_id"],
                "sceneId": scene["scene_id"],
                "prompt": segment_prompt,
                "durationSeconds": segment_seconds,
                "aspectRatio": aspect_ratio,
                "stylePreset": project_config.get("tone"),
                "metadata": {
                    "preferredModel": model,
                    "preferredFormat": format_id,
                    "platformPreset": platform_preset,
                    "generationMode": generation_mode,
                    "segmentKind": segment_kind,
                    "sourceVideoId": source_video_id,
                },
            }
            if segment_index == 0 and reference_assets:
                generation_payload["referenceAssets"] = reference_assets

            generated_job = _run_bridge(
                "generate",
                generation_payload,
            )

            clip_request["segment_index"] = segment_index
            clip_request["segment_kind"] = segment_kind
            clip_request["source_video_id"] = source_video_id
            clip_request["provider_job_id"] = str(generated_job["providerJobId"])
            clip_request["status"] = _provider_status_to_job_status(str(generated_job["status"])).value

            while True:
                polled_job = _run_bridge(
                    "poll",
                    {
                        "providerJobId": clip_request["provider_job_id"],
                    },
                )
                clip_request["provider_job_id"] = str(polled_job["providerJobId"])
                clip_request["status"] = _provider_status_to_job_status(str(polled_job["status"])).value

                if polled_job["status"] == "completed":
                    source_video_id = str(polled_job["providerJobId"])
                    segment_history.append(
                        {
                            "segment_index": segment_index,
                            "segment_kind": segment_kind,
                            "requested_seconds": segment_seconds,
                            "actual_duration_seconds": int(polled_job["actualDurationSeconds"]),
                            "provider_job_id": polled_job["providerJobId"],
                            "source_video_id": clip_request["source_video_id"],
                            "provider_metadata": polled_job.get("providerMetadata", {}),
                            "prompt": segment_prompt,
                        }
                    )
                    total_segments_rendered += 1
                    break

                if polled_job["status"] == "failed":
                    raise RuntimeError(
                        str(polled_job.get("errorMessage") or f"Clip generation failed for scene {scene['scene_id']}.")
                    )

                time.sleep(settings.poll_interval_ms / 1000)

        if not source_video_id:
            raise RuntimeError(f"No completed Sora video was produced for scene {scene['scene_id']}.")

        download_target = _download_target_path(state, clip_id)
        downloaded_asset = _run_bridge(
            "download",
            {
                "providerJobId": source_video_id,
                "outputPath": str(download_target),
            },
        )

        clip_request["provider_job_id"] = source_video_id
        clip_request["status"] = JobStatus.COMPLETED.value
        clip_request["actual_duration_seconds"] = int(segment_history[-1]["actual_duration_seconds"])
        clip_request["error_message"] = None
        clip_request["metadata"] = {
            **clip_request.get("metadata", {}),
            "segment_history": segment_history,
            "downloaded_asset": downloaded_asset,
            "local_video_path": downloaded_asset.get("localPath"),
            "local_video_bytes": downloaded_asset.get("byteSize"),
            "local_video_checksum": downloaded_asset.get("checksum"),
            "local_video_mime_type": downloaded_asset.get("mimeType"),
            "final_openai_video_id": source_video_id,
        }

        clip_requests.append(clip_request)
        completed_generation_summaries.append(
            {
                "clip_id": clip_id,
                "scene_id": scene["scene_id"],
                "provider_model": model,
                "resolved_duration_seconds": int(duration_resolution["totalDuration"]),
                "segment_count": len(execution_plan),
                "final_video_id": source_video_id,
            }
        )

        logger.info(
            "node.clip_generation | clip=%s scene=%s segments=%d model=%s video_id=%s",
            clip_id,
            scene["scene_id"],
            len(execution_plan),
            model,
            source_video_id,
        )

    if missing_prompt_scenes:
        raise RuntimeError(
            f"Clip generation is blocked because scene prompt records are missing for scene {', '.join(str(scene) for scene in missing_prompt_scenes)}."
        )

    return {
        "current_stage": WorkflowStage.CLIP_GENERATION.value,
        "clip_requests": clip_requests,
        "stage_attempts": append_stage_attempt(state, WorkflowStage.CLIP_GENERATION, JobStatus.COMPLETED),
        "audit_log": append_audit_event(
            state,
            action="clips.generated",
            entity_type="clip",
            stage=WorkflowStage.CLIP_GENERATION,
            metadata={
                "clip_count": len(clip_requests),
                "provider": project_config["provider"],
                "segment_count": total_segments_rendered,
                "generations": completed_generation_summaries,
            },
        ),
    }
