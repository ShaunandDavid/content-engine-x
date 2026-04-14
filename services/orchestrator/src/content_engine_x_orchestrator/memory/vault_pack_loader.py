"""Load compact runtime packs without reading full vault notes."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .obsidian_bridge import load_obsidian_bridge_settings


def _load_pack(relative_path: str) -> dict[str, Any] | None:
    settings = load_obsidian_bridge_settings()
    if not settings.configured or not settings.cache_path:
        return None

    absolute_path = Path(settings.cache_path) / relative_path
    if not absolute_path.exists():
        return None

    try:
        return json.loads(absolute_path.read_text(encoding="utf-8"))
    except Exception:
        return None


def load_user_pack(operator_user_id: str, pack_kind: str) -> dict[str, Any] | None:
    return _load_pack(f"packs/users/{operator_user_id}/{pack_kind}.json")


def load_business_pack(business_id: str, pack_kind: str) -> dict[str, Any] | None:
    return _load_pack(f"packs/businesses/{business_id}/{pack_kind}.json")
