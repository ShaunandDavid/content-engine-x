from __future__ import annotations

from typing import Any, Sequence

from langgraph.graph import END, START, StateGraph

from .models import ApprovalStatus, WorkflowStage
from .nodes import (
    brief_intake_node,
    clip_generation_node,
    concept_generation_node,
    prompt_creation_node,
    publish_payload_node,
    qc_decision_node,
    render_assembly_node,
    scene_planning_node,
)
from .state import WorkflowState


STAGE_NODE_NAMES = {
    WorkflowStage.BRIEF_INTAKE.value: "brief_intake",
    WorkflowStage.CONCEPT_GENERATION.value: "concept_generation",
    WorkflowStage.SCENE_PLANNING.value: "scene_planning",
    WorkflowStage.PROMPT_CREATION.value: "prompt_creation",
    WorkflowStage.CLIP_GENERATION.value: "clip_generation",
    WorkflowStage.QC_DECISION.value: "qc_decision",
    WorkflowStage.RENDER_ASSEMBLY.value: "render_assembly",
    WorkflowStage.PUBLISH_PAYLOAD.value: "publish_handoff",
}


def route_start(state: WorkflowState) -> str:
    requested = state.get("requested_start_stage", WorkflowStage.BRIEF_INTAKE.value)
    return STAGE_NODE_NAMES.get(requested, "brief_intake")


def route_after_qc(state: WorkflowState) -> str:
    approvals = state.get("approvals", [])
    if approvals and approvals[-1]["status"] == ApprovalStatus.APPROVED.value:
        return "render_assembly"
    return "halt_for_approval"


def build_workflow(*, checkpointer: Any | None = None, approval_interrupts: Sequence[str] | None = None):
    graph = StateGraph(WorkflowState)

    graph.add_node("brief_intake", brief_intake_node)
    graph.add_node("concept_generation", concept_generation_node)
    graph.add_node("scene_planning", scene_planning_node)
    graph.add_node("prompt_creation", prompt_creation_node)
    graph.add_node("clip_generation", clip_generation_node)
    graph.add_node("qc_decision", qc_decision_node)
    graph.add_node("render_assembly", render_assembly_node)
    graph.add_node("publish_handoff", publish_payload_node)

    graph.add_conditional_edges(START, route_start, {name: name for name in STAGE_NODE_NAMES.values()})
    graph.add_edge("brief_intake", "concept_generation")
    graph.add_edge("concept_generation", "scene_planning")
    graph.add_edge("scene_planning", "prompt_creation")
    graph.add_edge("prompt_creation", "clip_generation")
    graph.add_edge("clip_generation", "qc_decision")
    graph.add_conditional_edges(
        "qc_decision",
        route_after_qc,
        {
            "render_assembly": "render_assembly",
            "halt_for_approval": END,
        },
    )
    graph.add_edge("render_assembly", "publish_handoff")
    graph.add_edge("publish_handoff", END)

    return graph.compile(
        checkpointer=checkpointer,
        interrupt_before=list(approval_interrupts or []),
    )
