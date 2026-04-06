from __future__ import annotations

import json
import logging
from contextlib import contextmanager
from datetime import date, datetime
from typing import Any, Callable, Iterator
from uuid import UUID, uuid4

from psycopg import connect
from psycopg.rows import dict_row

from .enoch_contracts import (
    ENOCH_STATE_VERSION,
    DEFAULT_ENTRYPOINT,
    DEFAULT_TENANT_ID,
    DEFAULT_WORKFLOW_KIND,
    DEFAULT_WORKFLOW_VERSION,
    ArtifactRole,
)
from .enoch_persistence import (
    EnochArtifactWriteRequest,
    EnochAuditEventWriteRequest,
    EnochModelDecisionWriteRequest,
    EnochRunUpdateRequest,
)
from .config import load_settings
from .models import EnochArtifact, EnochModelDecision, JobStatus, WorkflowStage
from .state import utc_now

logger = logging.getLogger(__name__)


def _json_default(value: Any) -> str:
    if isinstance(value, UUID):
        return str(value)

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def to_jsonb(value: Any) -> str:
    return json.dumps(value, default=_json_default)


@contextmanager
def get_connection() -> Iterator[Any]:
    settings = load_settings()
    conninfo = settings.get_supabase_conninfo()

    with connect(conninfo, row_factory=dict_row) as connection:
        yield connection


def load_workflow_run_context(workflow_run_id: str) -> dict[str, Any]:
    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            select
              wr.id,
              wr.project_id,
              wr.status,
              wr.current_stage,
              wr.requested_stage,
              wr.state_snapshot,
              wr.metadata,
              p.name as project_name,
              p.status as project_status,
              p.current_stage as project_current_stage
            from public.workflow_runs wr
            join public.projects p on p.id = wr.project_id
            where wr.id = %s
            """,
            (workflow_run_id,),
        )
        row = cursor.fetchone()

    if not row:
        raise RuntimeError(f"Workflow run {workflow_run_id} was not found.")

    return row


def _safe_canonical_write(
    callback: Callable[[], None],
    *,
    operation: str,
    run_id: str,
    project_id: str | None = None,
    stage: str | None = None,
) -> None:
    try:
        callback()
    except Exception:
        # Canonical Enoch dual-write is additive during migration and must not
        # compromise the existing workflow persistence path.
        logger.warning(
            "Canonical Enoch dual-write failed during %s; continuing legacy persistence path. run_id=%s project_id=%s stage=%s",
            operation,
            run_id,
            project_id,
            stage,
            exc_info=True,
        )
        return


def _build_enoch_run_update_request(
    workflow_run_id: str,
    *,
    state_snapshot: dict[str, Any],
    status: str,
    current_stage: str,
    error_message: str | None = None,
    started_at: str | None = None,
    completed_at: str | None = None,
    output_refs: list[str] | None = None,
) -> EnochRunUpdateRequest:
    canonical_state = {
        **state_snapshot,
        "state_version": state_snapshot.get("state_version", ENOCH_STATE_VERSION),
        "workflow_run_id": state_snapshot.get("workflow_run_id", workflow_run_id),
        "run_id": state_snapshot.get("run_id", workflow_run_id),
        "tenant_id": state_snapshot.get("tenant_id", DEFAULT_TENANT_ID),
        "workflow_kind": state_snapshot.get("workflow_kind", DEFAULT_WORKFLOW_KIND),
        "workflow_version": state_snapshot.get("workflow_version", DEFAULT_WORKFLOW_VERSION),
        "entrypoint": state_snapshot.get("entrypoint", DEFAULT_ENTRYPOINT),
        "status": status,
        "current_stage": current_stage,
    }

    return EnochRunUpdateRequest(
        run_id=workflow_run_id,
        status=status,
        current_stage=current_stage,
        graph_thread_id=canonical_state.get("graph_thread_id"),
        state_version=canonical_state["state_version"],
        state_snapshot=canonical_state,
        error_message=error_message,
        started_at=started_at,
        completed_at=completed_at,
        output_refs=output_refs,
        metadata=canonical_state.get("metadata"),
    )


def _update_enoch_run(
    connection: Any,
    request: EnochRunUpdateRequest,
) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            update public.enoch_runs
            set
              status = coalesce(%s, status),
              current_stage = coalesce(%s, current_stage),
              graph_thread_id = coalesce(%s, graph_thread_id),
              state_version = coalesce(%s, state_version),
              state_snapshot = coalesce(%s::jsonb, state_snapshot),
              output_refs = coalesce(%s, output_refs),
              error_message = %s,
              started_at = coalesce(%s, started_at),
              completed_at = %s,
              metadata = coalesce(%s::jsonb, metadata),
              updated_at = %s
            where id = %s
            """,
            (
                request.status,
                request.current_stage,
                request.graph_thread_id,
                request.state_version,
                to_jsonb(request.state_snapshot) if request.state_snapshot is not None else None,
                request.output_refs,
                request.error_message,
                request.started_at,
                request.completed_at,
                to_jsonb(request.metadata) if request.metadata is not None else None,
                utc_now(),
                request.run_id,
            ),
        )


def _create_enoch_artifact(connection: Any, request: EnochArtifactWriteRequest) -> None:
    artifact = request.artifact

    with connection.cursor() as cursor:
        cursor.execute(
            """
            insert into public.enoch_artifacts (
              id,
              tenant_id,
              run_id,
              project_id,
              artifact_type,
              artifact_role,
              status,
              schema_name,
              schema_version,
              content_ref,
              content_json,
              storage_provider,
              storage_bucket,
              storage_key,
              checksum,
              error_message,
              metadata
            ) values (
              %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s, %s::jsonb
            )
            on conflict (id) do nothing
            """,
            (
                artifact.artifact_id,
                artifact.tenant_id,
                artifact.run_id,
                request.project_id,
                artifact.artifact_type,
                artifact.artifact_role.value,
                artifact.status.value if hasattr(artifact.status, "value") else artifact.status,
                artifact.schema_name,
                artifact.schema_version,
                artifact.content_ref,
                to_jsonb(artifact.content),
                request.storage_provider,
                request.storage_bucket,
                request.storage_key,
                artifact.checksum,
                request.error_message,
                to_jsonb(artifact.metadata),
            ),
        )


def _append_enoch_audit_event(connection: Any, request: EnochAuditEventWriteRequest) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            insert into public.enoch_audit_events (
              tenant_id,
              run_id,
              project_id,
              actor_type,
              actor_id,
              event_type,
              entity_type,
              entity_id,
              stage,
              payload,
              error_message
            ) values (
              %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s
            )
            """,
            (
                request.tenant_id,
                request.run_id,
                request.project_id,
                request.actor_type,
                request.actor_id,
                request.event_type,
                request.entity_type,
                request.entity_id,
                request.stage,
                to_jsonb(request.payload),
                request.error_message,
            ),
        )


def _create_enoch_model_decision(connection: Any, request: EnochModelDecisionWriteRequest) -> None:
    decision = request.decision

    with connection.cursor() as cursor:
        cursor.execute(
            """
            insert into public.enoch_model_decisions (
              id,
              tenant_id,
              run_id,
              project_id,
              stage,
              task_type,
              provider,
              model,
              selection_reason,
              fallback_of,
              metadata
            ) values (
              %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb
            )
            on conflict (id) do nothing
            """,
            (
                decision.decision_id,
                decision.tenant_id,
                decision.run_id,
                request.project_id,
                decision.stage.value,
                decision.task_type,
                decision.provider,
                decision.model,
                decision.selection_reason,
                request.fallback_of,
                to_jsonb(decision.metadata),
            ),
        )


def _build_artifact_refs(artifact_ids: list[str]) -> list[str]:
    return artifact_ids


def mark_workflow_running(workflow_run_id: str, state_snapshot: dict[str, Any]) -> dict[str, Any]:
    now = utc_now()

    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            update public.workflow_runs
            set
              status = %s,
              current_stage = %s,
              graph_thread_id = %s,
              started_at = coalesce(started_at, %s),
              state_snapshot = %s::jsonb,
              error_message = null,
              updated_at = %s
            where id = %s
            returning id, project_id
            """,
            (
                JobStatus.RUNNING.value,
                WorkflowStage.BRIEF_INTAKE.value,
                workflow_run_id,
                now,
                to_jsonb(state_snapshot),
                now,
                workflow_run_id,
            ),
        )
        workflow_row = cursor.fetchone()

        if not workflow_row:
            raise RuntimeError(f"Workflow run {workflow_run_id} could not be marked running.")

        cursor.execute(
            """
            update public.projects
            set
              status = %s,
              current_stage = %s,
              error_message = null,
              updated_at = %s
            where id = %s
            """,
            (
                JobStatus.RUNNING.value,
                WorkflowStage.BRIEF_INTAKE.value,
                now,
                workflow_row["project_id"],
            ),
        )

        # Canonical Enoch dual-write begins here. This update is additive and
        # intentionally fail-open so the existing workflow persistence path
        # remains the primary source of availability during migration.
        _safe_canonical_write(
            lambda: (
                _update_enoch_run(
                    connection,
                    _build_enoch_run_update_request(
                        workflow_run_id,
                        state_snapshot={
                            **state_snapshot,
                            "graph_thread_id": workflow_run_id,
                        },
                        status=JobStatus.RUNNING.value,
                        current_stage=WorkflowStage.BRIEF_INTAKE.value,
                        started_at=now,
                    ),
                ),
                _append_enoch_audit_event(
                    connection,
                    EnochAuditEventWriteRequest(
                        tenant_id=state_snapshot.get("tenant_id", DEFAULT_TENANT_ID),
                        run_id=workflow_run_id,
                        project_id=workflow_row["project_id"],
                        actor_type="service",
                        event_type="workflow.running",
                        entity_type="workflow_run",
                        entity_id=workflow_run_id,
                        stage=WorkflowStage.BRIEF_INTAKE.value,
                        payload={"source": "python_orchestrator_runtime"},
                    ),
                ),
            ),
            operation="mark_workflow_running",
            run_id=workflow_run_id,
            project_id=workflow_row["project_id"],
            stage=WorkflowStage.BRIEF_INTAKE.value,
        )

        connection.commit()
        return workflow_row


def persist_workflow_success(workflow_run_id: str, state: dict[str, Any]) -> None:
    now = utc_now()
    project_id = state["project_id"]
    concept = state.get("concept", {})
    scenes = state.get("scenes", [])
    prompts = state.get("prompt_versions", [])
    stage_attempts = state.get("stage_attempts", [])
    audit_log = state.get("audit_log", [])

    with get_connection() as connection, connection.cursor() as cursor:
        for scene in scenes:
            cursor.execute(
                """
                insert into public.scenes (
                  id,
                  project_id,
                  ordinal,
                  title,
                  narration,
                  visual_beat,
                  duration_seconds,
                  aspect_ratio,
                  status,
                  approval_status,
                  metadata,
                  error_message
                ) values (
                  %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, null
                )
                """,
                (
                  scene["scene_id"],
                  project_id,
                  scene["ordinal"],
                  scene["title"],
                  scene["narration"],
                  scene["visual_beat"],
                  scene["duration_seconds"],
                  scene["aspect_ratio"],
                  JobStatus.COMPLETED.value,
                  "pending",
                  to_jsonb({"source": "python_orchestrator"}),
                ),
            )

        for prompt in prompts:
            cursor.execute(
                """
                insert into public.prompts (
                  id,
                  project_id,
                  scene_id,
                  stage,
                  version,
                  provider,
                  model,
                  status,
                  system_prompt,
                  user_prompt,
                  compiled_prompt,
                  metadata,
                  error_message
                ) values (
                  %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, null
                )
                """,
                (
                  prompt["prompt_id"],
                  project_id,
                  prompt["scene_id"],
                  prompt["stage"],
                  prompt["version"],
                  prompt["provider"],
                  prompt["model"],
                  JobStatus.COMPLETED.value,
                  prompt["system_prompt"],
                  prompt["user_prompt"],
                  prompt["compiled_prompt"],
                  to_jsonb({"source": "python_orchestrator"}),
                ),
            )

        for event in audit_log:
            cursor.execute(
                """
                insert into public.audit_logs (
                  project_id,
                  workflow_run_id,
                  actor_type,
                  action,
                  entity_type,
                  entity_id,
                  stage,
                  metadata,
                  error_message
                ) values (
                  %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s
                )
                """,
                (
                  project_id,
                  workflow_run_id,
                  event.get("actor_type", "service"),
                  event["action"],
                  event["entity_type"],
                  event.get("entity_id"),
                  event.get("stage"),
                  to_jsonb(event.get("metadata", {})),
                  event.get("error_message"),
                ),
            )

        final_stage = state.get("current_stage", WorkflowStage.PROMPT_CREATION.value)

        cursor.execute(
            """
            update public.workflow_runs
            set
              status = %s,
              current_stage = %s,
              state_snapshot = %s::jsonb,
              stage_attempts = %s::jsonb,
              completed_at = %s,
              error_message = null,
              updated_at = %s
            where id = %s
            """,
            (
                JobStatus.COMPLETED.value,
                final_stage,
                to_jsonb(state),
                to_jsonb(stage_attempts),
                now,
                now,
                workflow_run_id,
            ),
        )

        cursor.execute(
            """
            update public.projects
            set
              status = %s,
              current_stage = %s,
              error_message = null,
              updated_at = %s
            where id = %s
            """,
            (
                JobStatus.COMPLETED.value,
                final_stage,
                now,
                project_id,
            ),
        )

        def canonical_success_write() -> None:
            output_artifact_ids: list[str] = []

            if concept:
                concept_artifact = EnochArtifact(
                    artifact_id=str(uuid4()),
                    tenant_id=state.get("tenant_id", DEFAULT_TENANT_ID),
                    run_id=workflow_run_id,
                    artifact_type="concept",
                    artifact_role=ArtifactRole.WORKING,
                    status=JobStatus.COMPLETED,
                    schema_name="content-engine-x.concept",
                    schema_version=DEFAULT_WORKFLOW_VERSION,
                    content_ref=None,
                    content=concept,
                    created_at=now,
                    updated_at=now,
                    metadata={"source": "python_orchestrator_runtime"},
                )
                _create_enoch_artifact(
                    connection,
                    EnochArtifactWriteRequest(
                        artifact=concept_artifact,
                        project_id=project_id,
                    ),
                )
                output_artifact_ids.append(concept_artifact.artifact_id)

            if scenes:
                scene_plan_artifact = EnochArtifact(
                    artifact_id=str(uuid4()),
                    tenant_id=state.get("tenant_id", DEFAULT_TENANT_ID),
                    run_id=workflow_run_id,
                    artifact_type="scene_plan",
                    artifact_role=ArtifactRole.OUTPUT,
                    status=JobStatus.COMPLETED,
                    schema_name="content-engine-x.scene-plan",
                    schema_version=DEFAULT_WORKFLOW_VERSION,
                    content_ref=None,
                    content=scenes,
                    created_at=now,
                    updated_at=now,
                    metadata={"source": "python_orchestrator_runtime", "count": len(scenes)},
                )
                _create_enoch_artifact(
                    connection,
                    EnochArtifactWriteRequest(
                        artifact=scene_plan_artifact,
                        project_id=project_id,
                    ),
                )
                output_artifact_ids.append(scene_plan_artifact.artifact_id)

            if prompts:
                prompt_bundle_artifact = EnochArtifact(
                    artifact_id=str(uuid4()),
                    tenant_id=state.get("tenant_id", DEFAULT_TENANT_ID),
                    run_id=workflow_run_id,
                    artifact_type="prompt_bundle",
                    artifact_role=ArtifactRole.OUTPUT,
                    status=JobStatus.COMPLETED,
                    schema_name="content-engine-x.prompt-bundle",
                    schema_version=DEFAULT_WORKFLOW_VERSION,
                    content_ref=None,
                    content=prompts,
                    created_at=now,
                    updated_at=now,
                    metadata={"source": "python_orchestrator_runtime", "count": len(prompts)},
                )
                _create_enoch_artifact(
                    connection,
                    EnochArtifactWriteRequest(
                        artifact=prompt_bundle_artifact,
                        project_id=project_id,
                    ),
                )
                output_artifact_ids.append(prompt_bundle_artifact.artifact_id)

                provider_model_pairs = sorted(
                    {
                        (prompt["provider"], prompt["model"])
                        for prompt in prompts
                        if prompt.get("provider") and prompt.get("model")
                    }
                )
                for provider, model in provider_model_pairs:
                    _create_enoch_model_decision(
                        connection,
                        EnochModelDecisionWriteRequest(
                            decision=EnochModelDecision(
                                decision_id=str(uuid4()),
                                tenant_id=state.get("tenant_id", DEFAULT_TENANT_ID),
                                run_id=workflow_run_id,
                                stage=WorkflowStage.PROMPT_CREATION,
                                task_type="prompt_creation",
                                provider=provider,
                                model=model,
                                selection_reason="Python orchestrator prompt creation persisted prompts using the selected provider/model pair.",
                                created_at=now,
                                metadata={"source": "python_orchestrator_runtime"},
                            ),
                            project_id=project_id,
                        ),
                    )

            for event in audit_log:
                _append_enoch_audit_event(
                    connection,
                    EnochAuditEventWriteRequest(
                        tenant_id=state.get("tenant_id", DEFAULT_TENANT_ID),
                        run_id=workflow_run_id,
                        project_id=project_id,
                        actor_type=event.get("actor_type", "service"),
                        event_type=event["action"],
                        entity_type=event["entity_type"],
                        entity_id=event.get("entity_id"),
                        stage=event.get("stage"),
                        payload={
                            "metadata": event.get("metadata", {}),
                            "compatibility_source": "audit_log",
                        },
                        error_message=event.get("error_message"),
                    ),
                )

            _append_enoch_audit_event(
                connection,
                EnochAuditEventWriteRequest(
                    tenant_id=state.get("tenant_id", DEFAULT_TENANT_ID),
                    run_id=workflow_run_id,
                    project_id=project_id,
                    actor_type="service",
                    event_type="workflow.completed",
                    entity_type="workflow_run",
                    entity_id=workflow_run_id,
                    stage=final_stage,
                    payload={"source": "python_orchestrator_runtime"},
                ),
            )

            _update_enoch_run(
                connection,
                _build_enoch_run_update_request(
                    workflow_run_id,
                    state_snapshot=state,
                    status=JobStatus.COMPLETED.value,
                    current_stage=final_stage,
                    completed_at=now,
                    output_refs=_build_artifact_refs(output_artifact_ids),
                ),
            )

        _safe_canonical_write(
            canonical_success_write,
            operation="persist_workflow_success",
            run_id=workflow_run_id,
            project_id=project_id,
            stage=WorkflowStage.PROMPT_CREATION.value,
        )

        connection.commit()


def persist_workflow_failure(
    workflow_run_id: str,
    *,
    project_id: str,
    current_stage: str,
    error_message: str,
    state_snapshot: dict[str, Any] | None = None,
) -> None:
    now = utc_now()
    snapshot = state_snapshot or {
        "project_id": project_id,
        "workflow_run_id": workflow_run_id,
        "current_stage": current_stage,
        "status": JobStatus.FAILED.value,
        "errors": [error_message],
    }

    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            insert into public.audit_logs (
              project_id,
              workflow_run_id,
              actor_type,
              action,
              entity_type,
              entity_id,
              stage,
              metadata,
              error_message
            ) values (
              %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s
            )
            """,
            (
                project_id,
                workflow_run_id,
                "service",
                "workflow.failed",
                "workflow_run",
                workflow_run_id,
                current_stage,
                to_jsonb({"source": "python_orchestrator"}),
                error_message,
            ),
        )

        cursor.execute(
            """
            update public.workflow_runs
            set
              status = %s,
              current_stage = %s,
              state_snapshot = %s::jsonb,
              error_message = %s,
              updated_at = %s
            where id = %s
            """,
            (
                JobStatus.FAILED.value,
                current_stage,
                to_jsonb(snapshot),
                error_message,
                now,
                workflow_run_id,
            ),
        )

        cursor.execute(
            """
            update public.projects
            set
              status = %s,
              current_stage = %s,
              error_message = %s,
              updated_at = %s
            where id = %s
            """,
            (
                JobStatus.FAILED.value,
                current_stage,
                error_message,
                now,
                project_id,
            ),
        )

        def canonical_failure_write() -> None:
            _append_enoch_audit_event(
                connection,
                EnochAuditEventWriteRequest(
                    tenant_id=snapshot.get("tenant_id", DEFAULT_TENANT_ID),
                    run_id=workflow_run_id,
                    project_id=project_id,
                    actor_type="service",
                    event_type="workflow.failed",
                    entity_type="workflow_run",
                    entity_id=workflow_run_id,
                    stage=current_stage,
                    payload={"source": "python_orchestrator_runtime"},
                    error_message=error_message,
                ),
            )

            _update_enoch_run(
                connection,
                _build_enoch_run_update_request(
                    workflow_run_id,
                    state_snapshot=snapshot,
                    status=JobStatus.FAILED.value,
                    current_stage=current_stage,
                    error_message=error_message,
                ),
            )

        _safe_canonical_write(
            canonical_failure_write,
            operation="persist_workflow_failure",
            run_id=workflow_run_id,
            project_id=project_id,
            stage=current_stage,
        )

        connection.commit()
