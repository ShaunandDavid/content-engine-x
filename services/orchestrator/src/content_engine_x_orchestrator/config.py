from __future__ import annotations

from dataclasses import dataclass
from os import getenv


@dataclass(frozen=True)
class OrchestratorSettings:
    openai_api_key: str | None
    openai_sora_model: str
    supabase_db_url: str | None
    default_approval_required: bool
    max_retries: int
    poll_interval_ms: int


def load_settings() -> OrchestratorSettings:
    return OrchestratorSettings(
        openai_api_key=getenv("OPENAI_API_KEY"),
        openai_sora_model=getenv("OPENAI_SORA_MODEL", "sora-2"),
        supabase_db_url=getenv("SUPABASE_DB_URL"),
        default_approval_required=getenv("WORKFLOW_DEFAULT_APPROVAL_REQUIRED", "true").lower() == "true",
        max_retries=int(getenv("WORKFLOW_MAX_RETRIES", "3")),
        poll_interval_ms=int(getenv("WORKFLOW_POLL_INTERVAL_MS", "5000")),
    )
