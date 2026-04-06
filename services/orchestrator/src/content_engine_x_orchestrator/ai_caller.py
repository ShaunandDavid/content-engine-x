"""ai_caller.py — Shared AI caller for pipeline nodes.

Sends structured prompts to OpenAI and returns validated JSON responses.
Adapted from open-multi-agent structured-output patterns (MIT licensed).
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def _get_api_key() -> str:
    key = os.environ.get("OPENAI_API_KEY", "")
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return key


def _extract_json(raw: str) -> Any:
    """Extract JSON from LLM output. Handles fenced blocks, bare JSON, etc."""
    trimmed = raw.strip()

    # Case 1: Direct parse
    try:
        return json.loads(trimmed)
    except json.JSONDecodeError:
        pass

    # Case 2: ```json fenced block
    match = re.search(r"```json\s*([\s\S]*?)```", trimmed)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Case 3: Bare ``` fenced block
    match = re.search(r"```\s*([\s\S]*?)```", trimmed)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Case 4: First { to last }
    obj_start = trimmed.find("{")
    obj_end = trimmed.rfind("}")
    if obj_start != -1 and obj_end > obj_start:
        try:
            return json.loads(trimmed[obj_start : obj_end + 1])
        except json.JSONDecodeError:
            pass

    # Case 5: First [ to last ]
    arr_start = trimmed.find("[")
    arr_end = trimmed.rfind("]")
    if arr_start != -1 and arr_end > arr_start:
        try:
            return json.loads(trimmed[arr_start : arr_end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Failed to extract JSON from LLM output: {trimmed[:200]}")


def call_ai(
    *,
    system_prompt: str,
    user_prompt: str,
    model: str = "gpt-4o",
    temperature: float = 0.7,
    max_tokens: int = 2000,
    required_keys: list[str] | None = None,
) -> dict[str, Any]:
    """Call OpenAI and return parsed JSON response.

    Args:
        system_prompt: System message with instructions and JSON schema.
        user_prompt: The specific request.
        model: OpenAI model to use.
        temperature: Sampling temperature.
        max_tokens: Max response tokens.
        required_keys: If provided, validate that all these keys exist in the response.

    Returns:
        Parsed JSON dict from the model's response.

    Raises:
        RuntimeError: If API call fails.
        ValueError: If response can't be parsed as JSON or is missing required keys.
    """
    api_key = _get_api_key()

    response = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        },
        timeout=60.0,
    )

    if response.status_code != 200:
        raise RuntimeError(
            f"OpenAI API returned {response.status_code}: {response.text[:500]}"
        )

    data = response.json()
    raw_content = data["choices"][0]["message"]["content"]

    logger.info(
        "ai_call completed | model=%s tokens_used=%s",
        model,
        data.get("usage", {}).get("total_tokens", "unknown"),
    )

    parsed = _extract_json(raw_content)

    if not isinstance(parsed, dict):
        raise ValueError(f"Expected JSON object, got {type(parsed).__name__}")

    if required_keys:
        missing = [k for k in required_keys if k not in parsed]
        if missing:
            raise ValueError(f"Response missing required keys: {missing}")

    return parsed
