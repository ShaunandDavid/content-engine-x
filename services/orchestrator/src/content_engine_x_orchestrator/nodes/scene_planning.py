from __future__ import annotations

from uuid import uuid4

from ..models import JobStatus, SceneDraft, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt


def _scene_durations(total_duration_seconds: int) -> list[int]:
    if total_duration_seconds == 15:
        return [5, 5, 5]
    if total_duration_seconds == 20:
        return [5, 5, 5, 5]
    return [7, 8, 7, 8]


def scene_planning_node(state: WorkflowState) -> WorkflowState:
    project_config = state["project_config"]
    concept = state["concept"]
    durations = _scene_durations(int(project_config["duration_seconds"]))
    aspect_ratio = project_config["aspect_ratio"]

    scenes = [
        SceneDraft(
            scene_id=str(uuid4()),
            ordinal=index + 1,
            title=f"Scene {index + 1}",
            visual_beat=f"{concept['visual_direction']} Beat {index + 1} focuses on {concept['thesis']}.",
            narration=(
                concept["hook"]
                if index == 0
                else f"Support the thesis with proof point {index + 1} and maintain urgency."
            ),
            duration_seconds=duration,
            aspect_ratio=aspect_ratio,
        ).model_dump(mode="json")
        for index, duration in enumerate(durations)
    ]

    return {
        "current_stage": WorkflowStage.SCENE_PLANNING.value,
        "scenes": scenes,
        "stage_attempts": append_stage_attempt(state, WorkflowStage.SCENE_PLANNING, JobStatus.COMPLETED),
        "audit_log": append_audit_event(
            state,
            action="scenes.planned",
            entity_type="scene",
            stage=WorkflowStage.SCENE_PLANNING,
            metadata={"scene_count": len(scenes)},
        ),
    }
