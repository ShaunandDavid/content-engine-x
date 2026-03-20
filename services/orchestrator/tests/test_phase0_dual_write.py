from __future__ import annotations

import contextlib
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
ORCHESTRATOR_SRC = WORKSPACE_ROOT / "services" / "orchestrator" / "src"
if str(ORCHESTRATOR_SRC) not in sys.path:
    sys.path.insert(0, str(ORCHESTRATOR_SRC))

from content_engine_x_orchestrator import supabase_store  # noqa: E402


class FakeCursor:
    def __init__(self, fetchone_values=None):
        self.fetchone_values = list(fetchone_values or [])
        self.executed = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def fetchone(self):
        if self.fetchone_values:
            return self.fetchone_values.pop(0)
        return None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class FakeConnection:
    def __init__(self, fetchone_values=None):
        self.cursor_instance = FakeCursor(fetchone_values)
        self.committed = False

    def cursor(self):
        return self.cursor_instance

    def commit(self):
        self.committed = True


def connection_context(connection):
    @contextlib.contextmanager
    def _context():
        yield connection

    return _context()


class Phase0RuntimeDualWriteTests(unittest.TestCase):
    def test_mark_workflow_running_dual_writes_canonical_run_and_audit(self):
        connection = FakeConnection([{"id": "run-1", "project_id": "project-1"}])
        run_updates = []
        audit_events = []

        with patch.object(supabase_store, "get_connection", return_value=connection_context(connection)):
            with patch.object(supabase_store, "_update_adam_run", side_effect=lambda conn, req: run_updates.append(req)):
                with patch.object(
                    supabase_store, "_append_adam_audit_event", side_effect=lambda conn, req: audit_events.append(req)
                ):
                    row = supabase_store.mark_workflow_running("run-1", {"metadata": {}})

        self.assertEqual(row["project_id"], "project-1")
        self.assertTrue(connection.committed)
        self.assertEqual(len(run_updates), 1)
        self.assertEqual(run_updates[0].status, "running")
        self.assertEqual(len(audit_events), 1)
        self.assertEqual(audit_events[0].event_type, "workflow.running")

    def test_mark_workflow_running_is_fail_open_when_canonical_write_fails(self):
        connection = FakeConnection([{"id": "run-1", "project_id": "project-1"}])

        with patch.object(supabase_store, "get_connection", return_value=connection_context(connection)):
            with patch.object(supabase_store, "_update_adam_run", side_effect=RuntimeError("boom")):
                row = supabase_store.mark_workflow_running("run-1", {"metadata": {}})

        self.assertEqual(row["project_id"], "project-1")
        self.assertTrue(connection.committed)

    def test_persist_workflow_success_dual_writes_artifacts_model_decisions_and_audits(self):
        connection = FakeConnection()
        artifacts = []
        model_decisions = []
        audit_events = []
        run_updates = []
        state = {
            "project_id": "project-1",
            "tenant_id": "00000000-0000-0000-0000-000000000000",
            "concept": {"hook": "Hook"},
            "scenes": [
                {
                    "scene_id": "scene-1",
                    "ordinal": 1,
                    "title": "Hook",
                    "narration": "Opening narration",
                    "visual_beat": "Opening visual",
                    "duration_seconds": 5,
                    "aspect_ratio": "9:16",
                }
            ],
            "prompt_versions": [
                {
                    "prompt_id": "prompt-1",
                    "scene_id": "scene-1",
                    "stage": "prompt_creation",
                    "version": 1,
                    "provider": "sora",
                    "model": "sora-2",
                    "system_prompt": "system",
                    "user_prompt": "user",
                    "compiled_prompt": "compiled",
                }
            ],
            "stage_attempts": [],
            "audit_log": [{"action": "prompts.created", "entity_type": "prompt", "metadata": {}}],
            "metadata": {},
        }

        with patch.object(supabase_store, "get_connection", return_value=connection_context(connection)):
            with patch.object(supabase_store, "_create_adam_artifact", side_effect=lambda conn, req: artifacts.append(req)):
                with patch.object(
                    supabase_store, "_create_adam_model_decision", side_effect=lambda conn, req: model_decisions.append(req)
                ):
                    with patch.object(
                        supabase_store, "_append_adam_audit_event", side_effect=lambda conn, req: audit_events.append(req)
                    ):
                        with patch.object(supabase_store, "_update_adam_run", side_effect=lambda conn, req: run_updates.append(req)):
                            supabase_store.persist_workflow_success("run-1", state)

        self.assertTrue(connection.committed)
        self.assertEqual(len(artifacts), 3)
        self.assertEqual(len(model_decisions), 1)
        self.assertEqual(len(audit_events), 2)
        self.assertEqual(run_updates[0].status, "completed")

    def test_persist_workflow_failure_dual_writes_failure_audit_and_run_update(self):
        connection = FakeConnection()
        audit_events = []
        run_updates = []

        with patch.object(supabase_store, "get_connection", return_value=connection_context(connection)):
            with patch.object(
                supabase_store, "_append_adam_audit_event", side_effect=lambda conn, req: audit_events.append(req)
            ):
                with patch.object(supabase_store, "_update_adam_run", side_effect=lambda conn, req: run_updates.append(req)):
                    supabase_store.persist_workflow_failure(
                        "run-1",
                        project_id="project-1",
                        current_stage="brief_intake",
                        error_message="failed",
                    )

        self.assertTrue(connection.committed)
        self.assertEqual(len(audit_events), 1)
        self.assertEqual(audit_events[0].event_type, "workflow.failed")
        self.assertEqual(run_updates[0].status, "failed")

    def test_persist_workflow_failure_is_fail_open_when_canonical_write_fails(self):
        connection = FakeConnection()

        with patch.object(supabase_store, "get_connection", return_value=connection_context(connection)):
            with patch.object(supabase_store, "_append_adam_audit_event", side_effect=RuntimeError("boom")):
                supabase_store.persist_workflow_failure(
                    "run-1",
                    project_id="project-1",
                    current_stage="brief_intake",
                    error_message="failed",
                )

        self.assertTrue(connection.committed)


if __name__ == "__main__":
    unittest.main()
