from __future__ import annotations

import logging
from threading import Thread

import uvicorn
from fastapi import FastAPI, Header, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from psycopg import OperationalError

from .config import load_settings
from .service import run_planning_workflow
from .supabase_store import load_workflow_run_context, persist_workflow_failure


class StartWorkflowRunRequest(BaseModel):
    workflow_run_id: str


app = FastAPI(title="Content Engine X Orchestrator", version="0.1.0")
logger = logging.getLogger(__name__)


def verify_signing_secret(received_secret: str | None) -> None:
    settings = load_settings()
    expected_secret = settings.workflow_signing_secret

    if expected_secret and received_secret != expected_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid workflow signing secret.")


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/workflow-runs/start", status_code=status.HTTP_202_ACCEPTED)
def start_workflow_run(
    payload: StartWorkflowRunRequest,
    x_workflow_signing_secret: str | None = Header(default=None),
) -> dict[str, str]:
    verify_signing_secret(x_workflow_signing_secret)

    try:
        context = load_workflow_run_context(payload.workflow_run_id)
    except RuntimeError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except OperationalError as error:
        logger.exception("Supabase connection failed while loading workflow run %s.", payload.workflow_run_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Supabase connection failed while loading workflow run: {error}",
        ) from error
    except Exception as error:
        logger.exception("Unexpected error while loading workflow run %s.", payload.workflow_run_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error while loading workflow run.",
        ) from error

    if context["status"] == "running":
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "workflow_run_id": payload.workflow_run_id,
                "status": "already_running",
            },
        )

    if context["status"] != "queued":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Workflow run is already {context['status']} and cannot be started.",
        )

    thread = Thread(target=_run_planning_workflow_safe, args=(payload.workflow_run_id,), daemon=True)
    thread.start()

    return {
        "workflow_run_id": payload.workflow_run_id,
        "status": "accepted",
    }


def _run_planning_workflow_safe(workflow_run_id: str) -> None:
    try:
        run_planning_workflow(workflow_run_id)
    except Exception as exc:
        logger.exception("Background planning workflow failed for %s.", workflow_run_id)
        # persist_workflow_failure was already called inside run_planning_workflow;
        # this guard handles any unexpected exception that escaped before that call.
        try:
            context = load_workflow_run_context(workflow_run_id)
            persist_workflow_failure(
                workflow_run_id,
                project_id=context["project_id"],
                current_stage=context.get("current_stage", "unknown"),
                error_message=str(exc),
            )
        except Exception:
            logger.exception(
                "Could not persist failure state for %s after background error.", workflow_run_id
            )


def main() -> None:
    settings = load_settings()
    uvicorn.run(app, host=settings.http_host, port=settings.http_port)


if __name__ == "__main__":
    main()
