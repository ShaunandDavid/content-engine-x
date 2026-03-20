from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import date, datetime
from typing import Any, Iterator
from uuid import UUID

from psycopg import connect
from psycopg.rows import dict_row

from .config import load_settings
from .models import JobStatus, WorkflowStage
from .state import utc_now


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

        connection.commit()
        return workflow_row


def persist_workflow_success(workflow_run_id: str, state: dict[str, Any]) -> None:
    now = utc_now()
    project_id = state["project_id"]
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
                WorkflowStage.PROMPT_CREATION.value,
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
                WorkflowStage.PROMPT_CREATION.value,
                now,
                project_id,
            ),
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

        connection.commit()
