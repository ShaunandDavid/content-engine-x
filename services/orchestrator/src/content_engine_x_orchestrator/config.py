from __future__ import annotations

from dataclasses import dataclass
from os import getenv
from psycopg.conninfo import make_conninfo


@dataclass(frozen=True)
class OrchestratorSettings:
    openai_api_key: str | None
    openai_sora_model: str
    supabase_db_url: str | None
    supabase_db_host: str | None
    supabase_db_port: int | None
    supabase_db_name: str | None
    supabase_db_user: str | None
    supabase_db_password: str | None
    supabase_db_sslmode: str | None
    workflow_signing_secret: str | None
    default_approval_required: bool
    max_retries: int
    poll_interval_ms: int
    http_host: str
    http_port: int

    def get_supabase_conninfo(self) -> str:
        if self.supabase_db_url:
            return self.supabase_db_url

        required_fields = {
            "SUPABASE_DB_HOST": self.supabase_db_host,
            "SUPABASE_DB_PORT": self.supabase_db_port,
            "SUPABASE_DB_NAME": self.supabase_db_name,
            "SUPABASE_DB_USER": self.supabase_db_user,
            "SUPABASE_DB_PASSWORD": self.supabase_db_password,
            "SUPABASE_DB_SSLMODE": self.supabase_db_sslmode,
        }
        missing_fields = [name for name, value in required_fields.items() if value in (None, "")]

        if missing_fields:
            raise RuntimeError(
                "Configure SUPABASE_DB_URL or set all split DB env vars: "
                "SUPABASE_DB_HOST, SUPABASE_DB_PORT, SUPABASE_DB_NAME, "
                "SUPABASE_DB_USER, SUPABASE_DB_PASSWORD, SUPABASE_DB_SSLMODE."
            )

        return make_conninfo(
            host=self.supabase_db_host,
            port=self.supabase_db_port,
            dbname=self.supabase_db_name,
            user=self.supabase_db_user,
            password=self.supabase_db_password,
            sslmode=self.supabase_db_sslmode,
        )


def load_settings() -> OrchestratorSettings:
    return OrchestratorSettings(
        openai_api_key=getenv("OPENAI_API_KEY"),
        openai_sora_model=getenv("OPENAI_SORA_MODEL", "sora-2"),
        supabase_db_url=getenv("SUPABASE_DB_URL"),
        supabase_db_host=getenv("SUPABASE_DB_HOST"),
        supabase_db_port=int(getenv("SUPABASE_DB_PORT")) if getenv("SUPABASE_DB_PORT") else None,
        supabase_db_name=getenv("SUPABASE_DB_NAME"),
        supabase_db_user=getenv("SUPABASE_DB_USER"),
        supabase_db_password=getenv("SUPABASE_DB_PASSWORD"),
        supabase_db_sslmode=getenv("SUPABASE_DB_SSLMODE", "require"),
        workflow_signing_secret=getenv("WORKFLOW_SIGNING_SECRET"),
        default_approval_required=getenv("WORKFLOW_DEFAULT_APPROVAL_REQUIRED", "true").lower() == "true",
        max_retries=int(getenv("WORKFLOW_MAX_RETRIES", "3")),
        poll_interval_ms=int(getenv("WORKFLOW_POLL_INTERVAL_MS", "5000")),
        http_host=getenv("ORCHESTRATOR_HTTP_HOST", "0.0.0.0"),
        http_port=int(getenv("ORCHESTRATOR_HTTP_PORT", "8000")),
    )
