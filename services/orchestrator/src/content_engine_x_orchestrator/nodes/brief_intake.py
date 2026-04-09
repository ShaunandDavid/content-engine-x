from __future__ import annotations

import logging

from ..brand_profile import build_brand_context_block, load_brand_profile
from ..models import JobStatus, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt

logger = logging.getLogger(__name__)


def brief_intake_node(state: WorkflowState) -> WorkflowState:
    brief = state.get("brief", {})
    project_config = state.get("project_config", {})

    if not brief.get("raw_brief"):
        raise ValueError("brief.raw_brief is required before brief intake can run.")

    # Load brand profile
    profile = load_brand_profile(
        project_id=str(state.get("project_id", "")),
        operator_user_id=str(state.get("operator_user_id", "")),
    )
    brand_block = build_brand_context_block(profile)

    if profile:
        logger.info("brief_intake: brand profile loaded for %s", profile.get("brand_name"))
    else:
        logger.info("brief_intake: no brand profile found, proceeding without brand context")

    return {
        "current_stage": WorkflowStage.BRIEF_INTAKE.value,
        "status": JobStatus.RUNNING.value,
        "brief": {
            **brief,
            "validated": True,
            "objective": brief.get("objective", "").strip(),
            "audience": brief.get("audience", "").strip(),
        },
        "project_config": {
            **project_config,
            "project_name": project_config.get("project_name", "Untitled Project"),
        },
        "brand_profile": profile,
        "brand_context_block": brand_block,
        "stage_attempts": append_stage_attempt(state, WorkflowStage.BRIEF_INTAKE, JobStatus.COMPLETED),
        "audit_log": append_audit_event(
            state,
            action="brief.validated",
            entity_type="brief",
            stage=WorkflowStage.BRIEF_INTAKE,
            metadata={
                "project_name": project_config.get("project_name"),
                "brand_loaded": profile is not None,
                "brand_name": profile.get("brand_name") if profile else None,
            },
        ),
    }
