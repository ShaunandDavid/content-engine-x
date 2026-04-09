"""hero_image_generation.py — Generate a brand hero image that anchors all video clips.

Uses DALL-E 3 to generate one cinematic hero image per project.
This image is uploaded to R2 and used as the reference image for every
Sora i2v clip — ensuring visual consistency across the entire video.

Position in pipeline: runs AFTER concept_generation, BEFORE scene_planning.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
from datetime import UTC, datetime
from urllib.parse import quote

import httpx

from ..state import WorkflowState, append_audit_event

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "content-engine-x")

HERO_IMAGE_PROMPT_TEMPLATE = """Cinematic brand hero image for a premium short-form video production.

Brand: {brand_name}
Visual style: {visual_style}
Primary color palette: {primary_color}
Video concept: {concept_title}
Visual direction: {visual_direction}
Tone: {tone}

Requirements:
- Ultra-cinematic, high-production-value composition
- Dark, dramatic lighting with {primary_color} accent glow
- No text, no logos, no overlays
- Shot as if by an award-winning cinematographer
- 16:9 widescreen composition
- Must work as a video opening frame — subject centered with motion headroom
- Style: {visual_style}
- Mood: premium, aspirational, brand-defining

This image will be the visual anchor for an entire video — make it iconic."""


# ---------------------------------------------------------------------------
# AWS Sig v4 helpers — minimal implementation for S3-compatible PUT
# ---------------------------------------------------------------------------

def _hmac_sha256(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _sig_key(secret: str, date_stamp: str, region: str, service: str) -> bytes:
    k_date = _hmac_sha256(f"AWS4{secret}".encode(), date_stamp)
    k_region = _hmac_sha256(k_date, region)
    k_service = _hmac_sha256(k_region, service)
    return _hmac_sha256(k_service, "aws4_request")


def _r2_put_headers(
    *,
    bucket: str,
    key: str,
    content: bytes,
    content_type: str,
    account_id: str,
    access_key_id: str,
    secret_access_key: str,
) -> dict[str, str]:
    """Return headers with AWS Sig v4 auth for R2 S3-compatible PUT."""
    region = "auto"
    service = "s3"
    host = f"{account_id}.r2.cloudflarestorage.com"
    now = datetime.now(UTC)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    encoded_key = quote(key, safe="/")

    payload_hash = hashlib.sha256(content).hexdigest()
    headers_to_sign = {
        "content-type": content_type,
        "host": host,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
    }
    signed_headers = ";".join(sorted(headers_to_sign))
    canonical_headers = "".join(f"{k}:{v}\n" for k, v in sorted(headers_to_sign.items()))

    canonical_request = "\n".join([
        "PUT",
        f"/{bucket}/{encoded_key}",
        "",
        canonical_headers,
        signed_headers,
        payload_hash,
    ])

    credential_scope = f"{date_stamp}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256",
        amz_date,
        credential_scope,
        hashlib.sha256(canonical_request.encode()).hexdigest(),
    ])

    sig = _hmac_sha256(_sig_key(secret_access_key, date_stamp, region, service), string_to_sign).hex()
    auth = (
        f"AWS4-HMAC-SHA256 Credential={access_key_id}/{credential_scope},"
        f" SignedHeaders={signed_headers},"
        f" Signature={sig}"
    )

    return {
        "Authorization": auth,
        "Content-Type": content_type,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
    }


# ---------------------------------------------------------------------------
# Core helpers
# ---------------------------------------------------------------------------

def _generate_hero_image_url(prompt: str) -> str | None:
    """Call DALL-E 3 to generate the hero image. Returns temporary URL."""
    if not OPENAI_API_KEY:
        logger.warning("hero_image: OPENAI_API_KEY not set, skipping generation")
        return None

    try:
        response = httpx.post(
            "https://api.openai.com/v1/images/generations",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "dall-e-3",
                "prompt": prompt,
                "n": 1,
                "size": "1792x1024",
                "quality": "hd",
                "style": "vivid",
            },
            timeout=60.0,
        )
        response.raise_for_status()
        return response.json()["data"][0]["url"]
    except Exception as exc:
        logger.warning("hero_image: DALL-E 3 generation failed: %s", exc)
        return None


def _upload_image_to_r2(image_url: str, project_id: str) -> str | None:
    """Download image from OpenAI temp URL and upload to R2 via S3 API. Returns R2 key."""
    if not all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY]):
        logger.warning("hero_image: R2 credentials not set, skipping upload")
        return None

    try:
        img_response = httpx.get(image_url, timeout=30.0)
        img_response.raise_for_status()
        image_bytes = img_response.content

        r2_key = f"projects/{project_id}/hero-image.png"
        endpoint = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
        put_url = f"{endpoint}/{R2_BUCKET}/{r2_key}"

        auth_headers = _r2_put_headers(
            bucket=R2_BUCKET,
            key=r2_key,
            content=image_bytes,
            content_type="image/png",
            account_id=R2_ACCOUNT_ID,
            access_key_id=R2_ACCESS_KEY_ID,
            secret_access_key=R2_SECRET_ACCESS_KEY,
        )

        upload_response = httpx.put(
            put_url,
            headers=auth_headers,
            content=image_bytes,
            timeout=30.0,
        )
        upload_response.raise_for_status()
        logger.info("hero_image: uploaded to R2 key=%s", r2_key)
        return r2_key

    except Exception as exc:
        logger.warning("hero_image: R2 upload failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------------

def hero_image_generation_node(state: WorkflowState) -> WorkflowState:
    concept = state.get("concept", {})
    brand_profile = state.get("brand_profile") or {}
    project_config = state["project_config"]
    project_id = str(state.get("project_id", ""))

    # Reuse existing brand hero image if already stored
    existing_hero_key = brand_profile.get("hero_image_r2_key")
    if existing_hero_key:
        logger.info("hero_image: reusing existing brand hero image key=%s", existing_hero_key)
        return {
            "hero_image_r2_key": existing_hero_key,
            "hero_image_generated": False,
            "audit_log": append_audit_event(
                state,
                action="hero_image.reused",
                entity_type="project",
                stage=None,
                entity_id=project_id,
                metadata={"r2_key": existing_hero_key},
            ),
        }

    hero_prompt = HERO_IMAGE_PROMPT_TEMPLATE.format(
        brand_name=brand_profile.get("brand_name", project_config.get("project_name", "Brand")),
        visual_style=brand_profile.get("visual_style", "dark cinematic"),
        primary_color=brand_profile.get("primary_color", "#00D4FF electric blue"),
        concept_title=concept.get("title", ""),
        visual_direction=concept.get("visual_direction", "cinematic, high-energy"),
        tone=project_config.get("tone", "authority"),
    )

    hero_r2_key: str | None = None
    ai_generated = False

    image_url = _generate_hero_image_url(hero_prompt)
    if image_url:
        hero_r2_key = _upload_image_to_r2(image_url, project_id)
        if hero_r2_key:
            ai_generated = True
            logger.info("hero_image: generated and uploaded key=%s", hero_r2_key)
        else:
            logger.warning("hero_image: upload failed, proceeding without anchor image")
    else:
        logger.warning("hero_image: generation failed, proceeding without anchor image")

    return {
        "hero_image_r2_key": hero_r2_key,
        "hero_image_generated": ai_generated,
        "audit_log": append_audit_event(
            state,
            action="hero_image.generated",
            entity_type="project",
            stage=None,
            entity_id=project_id,
            metadata={"r2_key": hero_r2_key, "ai_generated": ai_generated},
        ),
    }
