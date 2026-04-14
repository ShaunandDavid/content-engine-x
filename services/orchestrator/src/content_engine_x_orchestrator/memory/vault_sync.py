"""Phase 1 sync planning helpers for external vault integration."""

from __future__ import annotations

from typing import Any

from .obsidian_bridge import get_obsidian_bridge_status


def plan_vault_sync(mode: str = "full") -> dict[str, Any]:
    status = get_obsidian_bridge_status()
    return {
        "status": status["status"],
        "mode": mode,
        "synced": False,
        "reason": status["reason"] or "Vault sync is available through the managed Node-side memory APIs and compact pack refresh flow.",
        "touched_paths": [],
    }
