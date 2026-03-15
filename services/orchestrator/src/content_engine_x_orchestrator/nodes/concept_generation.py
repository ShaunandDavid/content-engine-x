from __future__ import annotations

from ..models import JobStatus, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt


def concept_generation_node(state: WorkflowState) -> WorkflowState:
    brief = state["brief"]
    project_config = state["project_config"]

    tone = project_config.get("tone", "authority")
    objective = brief.get("objective", "Drive awareness")
    audience = brief.get("audience", "busy professionals")

    concept = {
        "title": f"{project_config['project_name']}: {objective}",
        "hook": f"Stop scrolling: here is the fastest path to {objective.lower()}.",
        "thesis": f"Deliver one high-conviction insight for {audience}.",
        "visual_direction": f"{tone} pacing, punchy motion, clean brand framing.",
        "cta": "Save this and send it to the teammate who needs it.",
    }

    return {
        "current_stage": WorkflowStage.CONCEPT_GENERATION.value,
        "concept": concept,
        "stage_attempts": append_stage_attempt(state, WorkflowStage.CONCEPT_GENERATION, JobStatus.COMPLETED),
        "audit_log": append_audit_event(
            state,
            action="concept.generated",
            entity_type="project",
            stage=WorkflowStage.CONCEPT_GENERATION,
            entity_id=state["project_id"],
            metadata={"hook": concept["hook"]},
        ),
    }
