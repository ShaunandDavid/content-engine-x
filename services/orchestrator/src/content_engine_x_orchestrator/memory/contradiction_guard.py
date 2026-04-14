"""Load contradiction snapshots from compact cache state only."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .obsidian_bridge import load_obsidian_bridge_settings


def load_contradiction_snapshot() -> list[dict[str, Any]]:
    settings = load_obsidian_bridge_settings()
    if not settings.configured or not settings.cache_path:
        return []

    snapshot_path = Path(settings.cache_path) / "distill" / "contradictions.json"
    if not snapshot_path.exists():
        return []

    try:
        data = json.loads(snapshot_path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []
