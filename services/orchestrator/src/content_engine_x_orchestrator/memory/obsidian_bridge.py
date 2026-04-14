"""Safe, additive bridge for external Obsidian-backed memory."""

from __future__ import annotations

from dataclasses import dataclass
from os import getenv
from pathlib import Path


@dataclass(frozen=True)
class ObsidianBridgeSettings:
    enabled: bool
    vault_path: str | None
    cache_path: str | None
    distill_enabled: bool
    write_enabled: bool

    @property
    def configured(self) -> bool:
        return bool(self.enabled and self.vault_path and self.cache_path)

    @property
    def vault_path_obj(self) -> Path | None:
        return Path(self.vault_path).expanduser() if self.vault_path else None

    @property
    def cache_path_obj(self) -> Path | None:
        return Path(self.cache_path).expanduser() if self.cache_path else None


def load_obsidian_bridge_settings() -> ObsidianBridgeSettings:
    return ObsidianBridgeSettings(
        enabled=getenv("ENOCH_OBSIDIAN_ENABLED", "false").lower() == "true",
        vault_path=getenv("ENOCH_VAULT_PATH") or None,
        cache_path=getenv("ENOCH_MEMORY_CACHE_PATH") or None,
        distill_enabled=getenv("ENOCH_MEMORY_DISTILL_ENABLED", "false").lower() == "true",
        write_enabled=getenv("ENOCH_MEMORY_WRITE_ENABLED", "false").lower() == "true",
    )


def get_obsidian_bridge_status() -> dict[str, object]:
    settings = load_obsidian_bridge_settings()
    if not settings.enabled:
        return {
            "status": "disabled",
            "enabled": False,
            "configured": False,
            "vault_exists": False,
            "cache_exists": False,
            "reason": "ENOCH_OBSIDIAN_ENABLED is false.",
        }

    if not settings.configured:
        return {
            "status": "unconfigured",
            "enabled": True,
            "configured": False,
            "vault_exists": False,
            "cache_exists": False,
            "reason": "Both ENOCH_VAULT_PATH and ENOCH_MEMORY_CACHE_PATH are required.",
        }

    vault_exists = bool(settings.vault_path_obj and settings.vault_path_obj.exists())
    cache_exists = bool(settings.cache_path_obj and settings.cache_path_obj.exists())

    return {
        "status": "ready",
        "enabled": True,
        "configured": True,
        "vault_exists": vault_exists,
        "cache_exists": cache_exists,
        "reason": None,
    }
