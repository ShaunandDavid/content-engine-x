"""Canonical fact placeholders for future DB-backed truth synchronization."""

from __future__ import annotations

from typing import Any


def build_canonical_fact_placeholder(
    fact_key: str,
    fact_value: str,
    *,
    source: str,
    tenant_id: str | None = None,
    business_id: str | None = None,
) -> dict[str, Any]:
    return {
        "tenant_id": tenant_id,
        "business_id": business_id,
        "fact_key": fact_key,
        "fact_value": fact_value,
        "source": source,
        "persisted": False,
    }
