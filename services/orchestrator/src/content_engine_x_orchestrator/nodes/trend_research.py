"""trend_research.py — Source viral content concepts from external platforms,
score them, and output structured briefs for Content Engine X.

Contains both the standalone utility functions and the LangGraph node wrapper.
"""
from __future__ import annotations

import hashlib
import math
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any

import httpx
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


# ---------------------------------------------------------------------------
# Niche presets
# ---------------------------------------------------------------------------

NICHE_PRESETS: dict[str, dict[str, Any]] = {
    "celebrity": {
        "twitter_accounts": ["PopBase", "FearBuck", "Kira"],
        "subreddits": ["entertainment", "celebrity", "popculturechat"],
        "youtube_keywords": ["celebrity news", "hollywood drama", "pop culture"],
        "rss_feeds": [],
        "keywords": ["celebrity", "actor", "singer", "scandal", "dating", "breakup"],
    },
    "finance": {
        "twitter_accounts": ["unusual_whales", "WatcherGuru"],
        "subreddits": ["wallstreetbets", "stocks", "CryptoCurrency", "finance"],
        "youtube_keywords": ["stock market", "crypto news", "investing"],
        "rss_feeds": [],
        "keywords": ["stock", "crypto", "market", "investment", "earnings", "fed"],
    },
    "tech": {
        "twitter_accounts": ["rowancheung"],
        "subreddits": ["technology", "programming", "artificial", "gadgets"],
        "youtube_keywords": ["tech news", "AI breakthrough", "new gadget"],
        "rss_feeds": [],
        "keywords": ["AI", "startup", "launch", "update", "tech", "app"],
    },
    "gaming": {
        "twitter_accounts": ["Wario64", "Nibellion"],
        "subreddits": ["gaming", "Games", "pcgaming", "PS5"],
        "youtube_keywords": ["gaming news", "game release", "gaming drama"],
        "rss_feeds": [],
        "keywords": ["game", "release", "update", "leak", "console", "steam"],
    },
    "general": {
        "twitter_accounts": ["FearBuck", "Kira", "PopBase", "WatcherGuru"],
        "subreddits": ["all", "popular", "news", "worldnews"],
        "youtube_keywords": ["trending", "viral", "breaking news"],
        "rss_feeds": [],
        "keywords": [],
    },
}

PLATFORM_WEIGHTS: dict[str, float] = {
    "twitter_x": 1.5,
    "reddit": 1.2,
    "youtube_longform": 1.0,
    "news_rss": 0.8,
}


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

class ConceptBrief(BaseModel):
    id: str
    title: str
    source_platform: str
    source_url: str
    source_author: str
    engagement_score: float = 0.0
    engagement_raw: dict[str, Any] = Field(default_factory=dict)
    narrative_angle: str = ""
    key_facts: list[str] = Field(default_factory=list)
    evergreen: bool = False
    suggested_hook: str = ""
    suggested_duration: int = 30
    sentiment: str = "neutral"
    niche_tags: list[str] = Field(default_factory=list)

    def to_state_brief(self, audience: str = "general audience") -> dict[str, Any]:
        """Map this ConceptBrief into the dict format that brief_intake_node
        reads from state['brief'].

        Required keys: raw_brief, objective, audience.
        Optional: guardrails, validated.
        """
        return {
            "raw_brief": (
                f"[{self.source_platform}] {self.title}\n"
                f"Source: {self.source_url}\n"
                f"Angle: {self.narrative_angle}\n"
                f"Key facts: {'; '.join(self.key_facts)}\n"
                f"Hook: {self.suggested_hook}"
            ),
            "objective": self.narrative_angle or self.title,
            "audience": audience,
            "guardrails": [],
            "trend_source": {
                "id": self.id,
                "platform": self.source_platform,
                "url": self.source_url,
                "author": self.source_author,
                "engagement_score": self.engagement_score,
                "engagement_raw": self.engagement_raw,
                "sentiment": self.sentiment,
                "evergreen": self.evergreen,
                "niche_tags": self.niche_tags,
            },
        }


class RawPost(BaseModel):
    """Intermediate representation of a scraped post before scoring."""
    platform: str
    post_id: str
    title: str
    body: str = ""
    url: str = ""
    author: str = ""
    likes: int = 0
    comments: int = 0
    shares: int = 0
    views: int = 0
    published_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Engagement velocity scoring
# ---------------------------------------------------------------------------

def _age_hours(published_at: datetime | None) -> float:
    if published_at is None:
        return 24.0  # assume 1 day old if unknown
    delta = datetime.now(timezone.utc) - published_at
    hours = max(delta.total_seconds() / 3600.0, 0.1)  # floor at 6 min
    return hours


def compute_engagement_velocity(post: RawPost) -> float:
    """Compute engagement velocity score.

    Formula: ((shares * 4) + (comments * 2.5) + (likes * 1) + (views * 0.01))
             / age_hours * platform_weight

    Normalized to 0-100 on a log scale.
    """
    raw = (
        post.shares * 4.0
        + post.comments * 2.5
        + post.likes * 1.0
        + post.views * 0.01
    )
    age = _age_hours(post.published_at)
    weight = PLATFORM_WEIGHTS.get(post.platform, 1.0)
    velocity = (raw / age) * weight

    if velocity <= 0:
        return 0.0

    # Log-scale normalization: map velocity to 0-100
    # Calibrated so velocity=10 -> ~30, velocity=1000 -> ~70, velocity=100000 -> ~100
    score = min(100.0, max(0.0, 20.0 * math.log10(velocity + 1)))
    return round(score, 1)


def _deterministic_id(platform: str, post_id: str) -> str:
    raw = f"{platform}:{post_id}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _infer_sentiment(text: str) -> str:
    text_lower = text.lower()
    negative = sum(1 for w in ["crash", "scandal", "fired", "dead", "lawsuit",
                                "fraud", "arrested", "fail", "disaster", "war"]
                   if w in text_lower)
    positive = sum(1 for w in ["launch", "win", "record", "breakthrough",
                                "milestone", "success", "best", "amazing"]
                   if w in text_lower)
    controversial = sum(1 for w in ["controversial", "debate", "backlash",
                                     "slammed", "outrage", "divided"]
                        if w in text_lower)
    if controversial >= 2:
        return "controversial"
    if negative > positive:
        return "negative"
    if positive > negative:
        return "positive"
    return "neutral"


def _suggest_duration(evergreen: bool, platform: str) -> int:
    if platform == "youtube_longform":
        return 45
    if evergreen:
        return 40
    return 30


def _match_niche_tags(text: str, niche: str) -> list[str]:
    preset = NICHE_PRESETS.get(niche, NICHE_PRESETS["general"])
    keywords = preset.get("keywords", [])
    text_lower = text.lower()
    return [kw for kw in keywords if kw.lower() in text_lower]


def post_to_concept_brief(post: RawPost, niche: str = "general") -> ConceptBrief:
    """Convert a scored RawPost into a ConceptBrief."""
    full_text = f"{post.title} {post.body}"
    sentiment = _infer_sentiment(full_text)
    evergreen = not any(w in full_text.lower() for w in [
        "today", "just now", "breaking", "this morning", "tonight",
        "yesterday", "hours ago", "minutes ago",
    ])
    score = compute_engagement_velocity(post)
    niche_tags = _match_niche_tags(full_text, niche)

    # Generate a narrative angle
    if sentiment == "controversial":
        angle = f"The internet is divided over: {post.title}"
    elif sentiment == "negative":
        angle = f"Why this matters more than you think: {post.title}"
    else:
        angle = f"Here's what everyone missed about: {post.title}"

    # Generate a suggested hook
    hook = post.title
    if len(hook) > 80:
        hook = hook[:77] + "..."
    if not hook.endswith((".", "!", "?")):
        hook = f"Stop scrolling: {hook.lower()}."

    return ConceptBrief(
        id=_deterministic_id(post.platform, post.post_id),
        title=post.title,
        source_platform=post.platform,
        source_url=post.url,
        source_author=post.author,
        engagement_score=score,
        engagement_raw={
            "likes": post.likes,
            "comments": post.comments,
            "shares": post.shares,
            "views": post.views,
            "age_hours": round(_age_hours(post.published_at), 1),
        },
        narrative_angle=angle,
        key_facts=[post.title] if not post.body else [post.title, post.body[:200]],
        evergreen=evergreen,
        suggested_hook=hook,
        suggested_duration=_suggest_duration(evergreen, post.platform),
        sentiment=sentiment,
        niche_tags=niche_tags,
    )


# ---------------------------------------------------------------------------
# Platform scrapers
# ---------------------------------------------------------------------------

_HTTP_TIMEOUT = 15.0
_USER_AGENT = "ContentEngineX/1.0"


def _http_client() -> httpx.Client:
    return httpx.Client(
        timeout=_HTTP_TIMEOUT,
        headers={"User-Agent": _USER_AGENT},
        follow_redirects=True,
    )


# --- X / Twitter (API v2) -------------------------------------------------

def fetch_twitter_trends(
    niche: str = "general",
    *,
    max_results: int = 20,
    min_likes: int = 500,
) -> list[RawPost]:
    """Pull high-engagement tweets from niche redistribution accounts
    and keyword search. Requires TWITTER_BEARER_TOKEN env var."""
    token = _env("TWITTER_BEARER_TOKEN")
    if not token:
        return []

    preset = NICHE_PRESETS.get(niche, NICHE_PRESETS["general"])
    posts: list[RawPost] = []

    with _http_client() as client:
        headers = {"Authorization": f"Bearer {token}"}

        # Search by keyword with engagement filter
        keywords = preset.get("keywords", [])
        if keywords:
            query_parts = [f"({' OR '.join(keywords)})"]
            query_parts.append(f"min_faves:{min_likes}")
            query_parts.append("-is:retweet")
            query_parts.append("lang:en")
            query = " ".join(query_parts)

            try:
                resp = client.get(
                    "https://api.twitter.com/2/tweets/search/recent",
                    headers=headers,
                    params={
                        "query": query,
                        "max_results": min(max_results, 100),
                        "tweet.fields": "public_metrics,created_at,author_id",
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for tweet in data.get("data", []):
                        metrics = tweet.get("public_metrics", {})
                        created = tweet.get("created_at")
                        published = None
                        if created:
                            try:
                                published = datetime.fromisoformat(
                                    created.replace("Z", "+00:00")
                                )
                            except ValueError:
                                pass
                        posts.append(RawPost(
                            platform="twitter_x",
                            post_id=tweet["id"],
                            title=tweet.get("text", "")[:280],
                            body="",
                            url=f"https://x.com/i/status/{tweet['id']}",
                            author=tweet.get("author_id", ""),
                            likes=metrics.get("like_count", 0),
                            comments=metrics.get("reply_count", 0),
                            shares=metrics.get("retweet_count", 0)
                                   + metrics.get("quote_count", 0),
                            views=metrics.get("impression_count", 0),
                            published_at=published,
                        ))
            except httpx.HTTPError:
                pass  # non-fatal — other sources may still work

    return posts


# --- Reddit (public JSON API, no auth) ------------------------------------

def fetch_reddit_trends(
    niche: str = "general",
    *,
    max_results: int = 20,
    sort: str = "hot",
) -> list[RawPost]:
    """Pull hot/rising posts from relevant subreddits. No auth needed."""
    preset = NICHE_PRESETS.get(niche, NICHE_PRESETS["general"])
    subreddits = preset.get("subreddits", ["popular"])
    posts: list[RawPost] = []

    with _http_client() as client:
        for sub in subreddits:
            try:
                resp = client.get(
                    f"https://www.reddit.com/r/{sub}/{sort}.json",
                    params={"limit": min(max_results, 100)},
                )
                if resp.status_code != 200:
                    continue
                listing = resp.json().get("data", {}).get("children", [])
                for item in listing:
                    d = item.get("data", {})
                    if d.get("stickied"):
                        continue
                    created_utc = d.get("created_utc")
                    published = None
                    if created_utc:
                        try:
                            published = datetime.fromtimestamp(
                                created_utc, tz=timezone.utc
                            )
                        except (ValueError, OSError):
                            pass
                    posts.append(RawPost(
                        platform="reddit",
                        post_id=d.get("id", ""),
                        title=d.get("title", ""),
                        body=(d.get("selftext") or "")[:500],
                        url=f"https://reddit.com{d.get('permalink', '')}",
                        author=d.get("author", ""),
                        likes=d.get("ups", 0),
                        comments=d.get("num_comments", 0),
                        shares=d.get("num_crossposts", 0),
                        views=0,
                        published_at=published,
                    ))
            except httpx.HTTPError:
                continue

    return posts


# --- YouTube long-form (Data API v3) --------------------------------------

def fetch_youtube_trends(
    niche: str = "general",
    *,
    max_results: int = 10,
    min_duration_minutes: int = 5,
) -> list[RawPost]:
    """Search for trending long-form videos by keyword. Requires YOUTUBE_API_KEY."""
    api_key = _env("YOUTUBE_API_KEY")
    if not api_key:
        return []

    preset = NICHE_PRESETS.get(niche, NICHE_PRESETS["general"])
    keywords = preset.get("youtube_keywords", ["trending"])
    posts: list[RawPost] = []

    with _http_client() as client:
        for kw in keywords:
            try:
                # Search for videos
                search_resp = client.get(
                    "https://www.googleapis.com/youtube/v3/search",
                    params={
                        "part": "snippet",
                        "q": kw,
                        "type": "video",
                        "order": "viewCount",
                        "videoDuration": "medium",  # 4-20 min
                        "publishedAfter": _recent_iso(days=7),
                        "maxResults": min(max_results, 50),
                        "key": api_key,
                    },
                )
                if search_resp.status_code != 200:
                    continue

                items = search_resp.json().get("items", [])
                video_ids = [
                    it["id"]["videoId"]
                    for it in items
                    if it.get("id", {}).get("videoId")
                ]
                if not video_ids:
                    continue

                # Get statistics for found videos
                stats_resp = client.get(
                    "https://www.googleapis.com/youtube/v3/videos",
                    params={
                        "part": "statistics,snippet,contentDetails",
                        "id": ",".join(video_ids),
                        "key": api_key,
                    },
                )
                if stats_resp.status_code != 200:
                    continue

                for vid in stats_resp.json().get("items", []):
                    snippet = vid.get("snippet", {})
                    stats = vid.get("statistics", {})
                    published = None
                    pub_str = snippet.get("publishedAt")
                    if pub_str:
                        try:
                            published = datetime.fromisoformat(
                                pub_str.replace("Z", "+00:00")
                            )
                        except ValueError:
                            pass
                    posts.append(RawPost(
                        platform="youtube_longform",
                        post_id=vid["id"],
                        title=snippet.get("title", ""),
                        body=snippet.get("description", "")[:500],
                        url=f"https://www.youtube.com/watch?v={vid['id']}",
                        author=snippet.get("channelTitle", ""),
                        likes=int(stats.get("likeCount", 0)),
                        comments=int(stats.get("commentCount", 0)),
                        shares=0,
                        views=int(stats.get("viewCount", 0)),
                        published_at=published,
                        metadata={
                            "channel_id": snippet.get("channelId"),
                            "duration_iso": vid.get("contentDetails", {}).get(
                                "duration"
                            ),
                        },
                    ))
            except httpx.HTTPError:
                continue

    return posts


def _recent_iso(days: int = 7) -> str:
    from datetime import timedelta

    dt = datetime.now(timezone.utc) - timedelta(days=days)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# --- News / RSS (no auth) -------------------------------------------------

def fetch_rss_trends(
    niche: str = "general",
    *,
    feed_urls: list[str] | None = None,
) -> list[RawPost]:
    """Pull from configurable RSS feeds. No auth needed."""
    preset = NICHE_PRESETS.get(niche, NICHE_PRESETS["general"])
    urls = feed_urls or preset.get("rss_feeds", [])
    if not urls:
        return []

    posts: list[RawPost] = []

    with _http_client() as client:
        for feed_url in urls:
            try:
                resp = client.get(feed_url)
                if resp.status_code != 200:
                    continue
                root = ET.fromstring(resp.text)
                # Handle both RSS 2.0 and Atom feeds
                items = root.findall(".//item") or root.findall(
                    ".//{http://www.w3.org/2005/Atom}entry"
                )
                for item in items[:20]:
                    title = (
                        _xml_text(item, "title")
                        or _xml_text(
                            item, "{http://www.w3.org/2005/Atom}title"
                        )
                        or ""
                    )
                    link = (
                        _xml_text(item, "link")
                        or _xml_attr(
                            item, "{http://www.w3.org/2005/Atom}link", "href"
                        )
                        or ""
                    )
                    description = (
                        _xml_text(item, "description")
                        or _xml_text(
                            item, "{http://www.w3.org/2005/Atom}summary"
                        )
                        or ""
                    )
                    pub_date_str = (
                        _xml_text(item, "pubDate")
                        or _xml_text(
                            item, "{http://www.w3.org/2005/Atom}published"
                        )
                    )
                    published = _parse_rss_date(pub_date_str)

                    # Strip HTML tags from description
                    description = re.sub(r"<[^>]+>", "", description)[:500]

                    posts.append(RawPost(
                        platform="news_rss",
                        post_id=hashlib.md5(
                            (link or title).encode()
                        ).hexdigest()[:12],
                        title=title,
                        body=description,
                        url=link,
                        author="",
                        published_at=published,
                    ))
            except (httpx.HTTPError, ET.ParseError):
                continue

    return posts


def _xml_text(element: ET.Element, tag: str) -> str | None:
    child = element.find(tag)
    return child.text if child is not None and child.text else None


def _xml_attr(element: ET.Element, tag: str, attr: str) -> str | None:
    child = element.find(tag)
    return child.get(attr) if child is not None else None


def _parse_rss_date(date_str: str | None) -> datetime | None:
    if not date_str:
        return None
    # Try ISO format first
    for fmt in [
        "%a, %d %b %Y %H:%M:%S %z",   # RFC 822
        "%a, %d %b %Y %H:%M:%S %Z",
        "%Y-%m-%dT%H:%M:%S%z",          # ISO 8601
        "%Y-%m-%dT%H:%M:%SZ",
    ]:
        try:
            return datetime.strptime(date_str.strip(), fmt).replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# Long-form to short-form compression
# ---------------------------------------------------------------------------

def longform_to_shortform(
    youtube_url: str,
    niche: str = "general",
    audience: str = "general audience",
) -> ConceptBrief:
    """Accept a YouTube URL, extract video ID, pull transcript, and compress
    into a 35-45 second short-form concept brief.

    Requires the `youtube-transcript-api` package. If not installed, raises
    ImportError with install instructions.
    """
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        raise ImportError(
            "longform_to_shortform requires the 'youtube-transcript-api' "
            "package. Install it with: pip install youtube-transcript-api"
        )

    video_id = _extract_video_id(youtube_url)
    if not video_id:
        raise ValueError(f"Could not extract video ID from URL: {youtube_url}")

    # Pull transcript
    try:
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
    except Exception as exc:
        raise RuntimeError(
            f"Failed to fetch transcript for {video_id}: {exc}"
        ) from exc

    full_text = " ".join(entry["text"] for entry in transcript_list)

    # Get video metadata via YouTube Data API if available
    title = f"YouTube video {video_id}"
    author = ""
    views = 0
    api_key = _env("YOUTUBE_API_KEY")
    if api_key:
        try:
            with _http_client() as client:
                resp = client.get(
                    "https://www.googleapis.com/youtube/v3/videos",
                    params={
                        "part": "snippet,statistics",
                        "id": video_id,
                        "key": api_key,
                    },
                )
                if resp.status_code == 200:
                    items = resp.json().get("items", [])
                    if items:
                        snippet = items[0].get("snippet", {})
                        stats = items[0].get("statistics", {})
                        title = snippet.get("title", title)
                        author = snippet.get("channelTitle", "")
                        views = int(stats.get("viewCount", 0))
        except httpx.HTTPError:
            pass

    # Compress transcript into key points
    key_facts = _extract_key_points(full_text, max_points=5)

    # Build the concept brief
    hook = _generate_compression_hook(title, key_facts)

    return ConceptBrief(
        id=_deterministic_id("youtube_longform", video_id),
        title=title,
        source_platform="youtube_longform",
        source_url=youtube_url,
        source_author=author,
        engagement_score=min(100.0, max(0.0, 20.0 * math.log10(views + 1)))
        if views > 0
        else 50.0,
        engagement_raw={"views": views, "source": "longform_compression"},
        narrative_angle=f"A {len(full_text.split())}-word video compressed into "
                        f"45 seconds: {title}",
        key_facts=key_facts,
        evergreen=True,
        suggested_hook=hook,
        suggested_duration=45,
        sentiment=_infer_sentiment(full_text),
        niche_tags=_match_niche_tags(f"{title} {full_text[:500]}", niche),
    )


def _extract_video_id(url: str) -> str | None:
    patterns = [
        r"(?:v=|\/v\/|youtu\.be\/)([a-zA-Z0-9_-]{11})",
        r"(?:embed\/)([a-zA-Z0-9_-]{11})",
        r"(?:shorts\/)([a-zA-Z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    # Bare video ID
    if re.match(r"^[a-zA-Z0-9_-]{11}$", url):
        return url
    return None


def _extract_key_points(text: str, max_points: int = 5) -> list[str]:
    """Extract key points from a transcript using sentence scoring."""
    sentences = re.split(r"[.!?]+", text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 20]

    if not sentences:
        return [text[:200]]

    # Score sentences by position and keyword density
    scored: list[tuple[float, str]] = []
    total = len(sentences)
    for i, sent in enumerate(sentences):
        position_score = 0.0
        # First and last 10% of sentences get bonus
        if i < total * 0.1:
            position_score = 2.0
        elif i > total * 0.9:
            position_score = 1.5

        # Keyword density — sentences with numbers, names, claims
        keyword_score = 0.0
        if re.search(r"\d+", sent):
            keyword_score += 1.0
        if re.search(r"[A-Z][a-z]+(?:\s[A-Z][a-z]+)+", sent):
            keyword_score += 0.5
        if any(w in sent.lower() for w in [
            "because", "reason", "actually", "turns out", "secret",
            "never", "always", "million", "billion", "percent",
        ]):
            keyword_score += 1.0

        scored.append((position_score + keyword_score, sent))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [s for _, s in scored[:max_points]]


def _generate_compression_hook(title: str, key_facts: list[str]) -> str:
    """Generate a short hook from the title and key facts."""
    if key_facts:
        return f"A viral video just proved: {key_facts[0][:60]}."
    return f"Stop scrolling: {title[:60].lower()}."


# ---------------------------------------------------------------------------
# Main research pipeline
# ---------------------------------------------------------------------------

def research_trends(
    niche: str = "general",
    *,
    max_results_per_platform: int = 15,
    min_engagement_score: float = 20.0,
    rss_feeds: list[str] | None = None,
) -> list[ConceptBrief]:
    """Run all platform scrapers, score results, and return ranked
    ConceptBriefs sorted by engagement velocity.

    This is the primary entry point for the trend research module.
    """
    all_posts: list[RawPost] = []

    all_posts.extend(fetch_twitter_trends(
        niche, max_results=max_results_per_platform,
    ))
    all_posts.extend(fetch_reddit_trends(
        niche, max_results=max_results_per_platform,
    ))
    all_posts.extend(fetch_youtube_trends(
        niche, max_results=max_results_per_platform,
    ))
    all_posts.extend(fetch_rss_trends(
        niche, feed_urls=rss_feeds,
    ))

    # Convert to ConceptBriefs and score
    briefs = [post_to_concept_brief(post, niche) for post in all_posts]

    # Filter by minimum engagement score
    briefs = [b for b in briefs if b.engagement_score >= min_engagement_score]

    # Sort by engagement score descending
    briefs.sort(key=lambda b: b.engagement_score, reverse=True)

    return briefs


# ---------------------------------------------------------------------------
# LangGraph node wrapper
# ---------------------------------------------------------------------------

from ..models import JobStatus, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt


def trend_research_node(state: WorkflowState) -> WorkflowState:
    """LangGraph node for trend research.

    - If state["brief"] already has content (manual brief): no-op passthrough.
    - If state["trend_niche"] is set: run scrapers, populate state["brief"]
      from top result.
    - Otherwise: no-op passthrough.
    """
    brief = state.get("brief", {})

    # Manual brief already exists — passthrough
    if brief.get("raw_brief"):
        return {
            "current_stage": WorkflowStage.TREND_RESEARCH.value,
            "trend_source": "manual",
            "stage_attempts": append_stage_attempt(
                state, WorkflowStage.TREND_RESEARCH, JobStatus.COMPLETED,
            ),
            "audit_log": append_audit_event(
                state,
                action="trend.researched",
                entity_type="brief",
                stage=WorkflowStage.TREND_RESEARCH,
                metadata={"source": "manual", "skipped": True},
            ),
        }

    # Check for auto-research niche
    niche = state.get("trend_niche", "")
    if not niche:
        # No niche configured — passthrough
        return {
            "current_stage": WorkflowStage.TREND_RESEARCH.value,
            "trend_source": "manual",
            "stage_attempts": append_stage_attempt(
                state, WorkflowStage.TREND_RESEARCH, JobStatus.COMPLETED,
            ),
            "audit_log": append_audit_event(
                state,
                action="trend.researched",
                entity_type="brief",
                stage=WorkflowStage.TREND_RESEARCH,
                metadata={"source": "manual", "no_niche": True},
            ),
        }

    # Auto-research: run all platform scrapers
    briefs = research_trends(niche)
    trend_brief_dicts = [b.model_dump(mode="json") for b in briefs]

    result: WorkflowState = {
        "current_stage": WorkflowStage.TREND_RESEARCH.value,
        "trend_source": "auto",
        "trend_niche": niche,
        "trend_briefs": trend_brief_dicts,
        "stage_attempts": append_stage_attempt(
            state, WorkflowStage.TREND_RESEARCH, JobStatus.COMPLETED,
        ),
    }

    # Map top-scoring brief into state["brief"] and build structured trend_data
    if briefs:
        top = briefs[0]
        audience = state.get("project_config", {}).get(
            "audience", "general audience"
        )
        result["brief"] = top.to_state_brief(audience)
        result["trend_data"] = {
            "top_trend": top.title,
            "trend_hook": top.suggested_hook,
            "trend_source": top.source_platform,
            "trend_momentum": top.engagement_score,
            "content_angle": top.narrative_angle,
        }

    result["audit_log"] = append_audit_event(
        state,
        action="trend.researched",
        entity_type="brief",
        stage=WorkflowStage.TREND_RESEARCH,
        metadata={
            "source": "auto",
            "niche": niche,
            "source_count": len(briefs),
            "top_score": briefs[0].engagement_score if briefs else 0,
        },
    )

    return result
