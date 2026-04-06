# ENOCH — TREND SCANNER SECURITY PROTOCOLS
## Anti-Detection, Rate Limiting, and Platform Compliance

---

## Principle: API First, Scrape Last, Never Spam

Every platform interaction must follow this hierarchy:
1. Official API with auth tokens (safest — you're a registered developer)
2. Public data endpoints (RSS, JSON feeds — no auth, no scraping)
3. Browser-like scraping (last resort — highest ban risk)

If caught violating platform ToS, you lose access permanently.
Enoch must protect himself.

---

## Platform-Specific Protocols

### 1. X/Twitter (Highest Risk)

**Use: Official API v2 only.**
- Bearer token authentication (registered developer app)
- Respect rate limits exactly: 300 requests/15 min (app-level), 900/15 min (user-level)
- Build a token bucket rate limiter into the scraper — track requests in memory
- Add jitter: don't hit exactly every 3 seconds. Randomize between 2.5-4.5 seconds
- Never scrape the X website directly — their bot detection (Arkose Labs) is aggressive
- If you get a 429 (rate limited), back off exponentially: 30s → 60s → 120s → 240s
- Log every API call with timestamp for audit

**Rate limiter implementation:**
```python
import time, random

class RateLimiter:
    def __init__(self, max_requests=280, window_seconds=900):
        self.max_requests = max_requests  # Leave 20 buffer under 300 limit
        self.window = window_seconds
        self.requests = []

    async def wait_if_needed(self):
        now = time.time()
        # Remove requests outside the window
        self.requests = [t for t in self.requests if now - t < self.window]
        if len(self.requests) >= self.max_requests:
            sleep_time = self.window - (now - self.requests[0]) + random.uniform(1, 5)
            await asyncio.sleep(sleep_time)
        # Add jitter
        await asyncio.sleep(random.uniform(0.5, 2.0))
        self.requests.append(time.time())
```

**What NOT to do:**
- No rapid-fire search queries (looks like scraping)
- No following/unfollowing accounts programmatically
- No liking/retweeting through Enoch — read-only operations only
- No storing or redistributing tweet content verbatim (ToS violation)

---

### 2. Reddit (Medium Risk)

**Use: Public JSON API (no auth needed for reads).**
- Append `.json` to any subreddit URL: `reddit.com/r/technology/hot.json`
- Reddit rate limits: 60 requests/minute for unauthenticated
- Set a proper User-Agent header: `Enoch/1.0 (Content Engine X by XenTeck; contact: dj@xenteck.com)`
- Reddit BLOCKS requests with generic User-Agents (python-requests, curl, etc.)
- Space requests: minimum 1.5 seconds between calls, randomize 1.5-3.0 seconds
- If you get 429: back off for 60 seconds, then resume at half speed

**Optional upgrade — Reddit OAuth (higher limits):**
- Register a "script" app at reddit.com/prefs/apps
- Get client_id and client_secret
- Authenticated requests get 600 requests/minute (10x improvement)
- Worth doing if you're scanning 20+ subreddits

**What NOT to do:**
- No posting, commenting, or voting through Enoch
- No scraping user profiles or DMs
- No bypassing rate limits with multiple accounts

---

### 3. YouTube Data API v3 (Low Risk)

**Use: Official API with API key.**
- 10,000 quota units/day (free tier)
- Search costs 100 units per call = ~100 searches/day
- Video details cost 1 unit per call = generous
- This is enough for trend scanning (you need maybe 20-30 searches/day)
- No rate limiter needed beyond quota tracking — YouTube handles it gracefully
- If you hit quota: stop for the day, resume at midnight Pacific

**Quota tracker:**
```python
class YouTubeQuotaTracker:
    def __init__(self, daily_limit=9500):  # Buffer under 10K
        self.daily_limit = daily_limit
        self.used_today = 0
        self.reset_date = None

    def can_search(self):
        self._check_reset()
        return self.used_today + 100 <= self.daily_limit

    def record_search(self):
        self.used_today += 100

    def record_video_detail(self):
        self.used_today += 1

    def _check_reset(self):
        today = datetime.utcnow().date()
        if self.reset_date != today:
            self.used_today = 0
            self.reset_date = today
```

**What NOT to do:**
- No downloading videos through the API (use youtube-transcript-api for transcripts only)
- No scraping YouTube pages directly (they use aggressive bot detection)
- No storing or serving YouTube video content

---

### 4. RSS/News Feeds (Lowest Risk)

**Use: Standard HTTP GET with feedparser.**
- RSS is designed to be consumed by machines — you're fine
- Still be polite: 5-10 second intervals between different feeds
- Cache feed results for at least 15 minutes (most feeds update hourly at most)
- Set a proper User-Agent header
- Respect `Cache-Control` and `ETag` headers if present

**What NOT to do:**
- No hitting the same feed more than once per 15 minutes
- No scraping the actual article pages unless you need them (use the RSS summary)

---

## Global Security Rules

### Request Fingerprinting
Every HTTP request from Enoch should look like a normal application, not a bot:

```python
HEADERS = {
    "User-Agent": "Enoch/1.0 (Content Research Engine; contact: dj@xenteck.com)",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
}
```

- Use a consistent User-Agent that identifies your app (platforms prefer this over spoofing)
- Never spoof browser User-Agents — if caught, it's an instant ban
- Use connection pooling (httpx.AsyncClient with limits) — don't open/close connections rapidly

### Request Scheduling
Enoch should NOT scan all platforms simultaneously. Stagger them:

```
Scan Schedule (per run):
  0:00 — Twitter/X (highest priority, fastest signal)
  0:30 — Reddit (2-3 minute scan)
  3:00 — YouTube long-form (quota-sensitive, run fewer searches)
  5:00 — RSS feeds (fastest, lowest risk)
  Total scan time: ~6-8 minutes per cycle

  Minimum gap between full cycles: 30 minutes
  Recommended: run 2-4 cycles per day, not continuously
```

### Retry and Backoff Strategy
All platforms use the same escalating backoff:

```
Attempt 1: wait 0s (normal request)
Attempt 2: wait 5-10s (random jitter)
Attempt 3: wait 30-60s (random jitter)
Attempt 4: wait 120-180s (random jitter)
Attempt 5: STOP — log error, skip this source for this cycle
```

Never retry more than 5 times per source per cycle. If a platform is consistently failing, disable that scraper and alert the operator.

### Data Handling
- Store only: title, URL, engagement metrics, timestamps
- Do NOT store full tweet text verbatim (Twitter ToS violation)
- Do NOT store Reddit post bodies (just titles and URLs)
- Do NOT store YouTube video content (just metadata)
- Paraphrase and transform everything before it enters the script pipeline
- Concept briefs should be INSPIRED by trends, not copies of them

### Credential Security
- All API keys in .env file only — NEVER hardcoded
- .env is in .gitignore (already is)
- Rotate Twitter Bearer Token every 90 days
- YouTube API key can be restricted to specific IPs in Google Cloud Console
- If any key is compromised: revoke immediately, generate new one

### Logging and Audit
Every scrape cycle should log:
```json
{
  "cycle_id": "uuid",
  "timestamp": "iso8601",
  "platform": "twitter_x",
  "requests_made": 15,
  "rate_limit_hits": 0,
  "errors": [],
  "concepts_found": 8,
  "top_score": 87.3,
  "duration_seconds": 45
}
```

Store in Supabase `audit_log` table — this is your proof that Enoch behaves responsibly.

---

## Publishing Safety (n8n Layer)

The trend scanner is READ-ONLY — it never posts content. But the downstream publisher (n8n) does. Rules:

1. **Human approval gate exists** — qc_decision node halts for operator review
2. **Never auto-post to any platform without human approval on the first 50 videos**
3. **After 50 manually approved videos, auto-posting can be enabled per platform with these limits:**
   - TikTok: max 3 posts/day (their spam threshold is ~5-7)
   - Instagram Reels: max 2 posts/day
   - YouTube Shorts: max 2 posts/day (quality > quantity — Daniel Baton rule)
   - LinkedIn: max 1 post/day
4. **Platform-specific posting intervals:**
   - Minimum 4 hours between posts on the same platform
   - Randomize posting times within a 30-minute window (don't post at exactly 9:00 AM every day)
5. **Content uniqueness check** — before publishing, verify the video/caption isn't too similar to the last 10 posts on that platform
6. **If any platform returns an error or warning** — halt all auto-posting on that platform and alert the operator

---

## Emergency Kill Switch

If Enoch detects any of these, ALL scanning and publishing stops immediately:
- Any platform returns a 403 Forbidden (account/app may be flagged)
- More than 3 consecutive 429s from the same platform in one cycle
- Any platform returns a "suspicious activity" or "verify your identity" response
- Rate limiter detects requests exceeding 80% of any platform's known limit

Kill switch logs the event, sends a Telegram alert to DJ, and requires manual restart.

---

## Summary: What Enoch Can and Cannot Do

### CAN DO (safe):
- Read public tweets via API
- Read public Reddit posts via JSON API
- Search YouTube via Data API
- Read RSS feeds
- Score and rank engagement
- Generate concept briefs from trends
- Pass briefs to the content pipeline

### CANNOT DO (banned):
- Post, like, follow, retweet, or comment on any platform
- Scrape websites directly (bypass APIs)
- Spoof User-Agents or browser fingerprints
- Store verbatim content from any platform
- Run continuously without rate limiting
- Auto-publish without human approval (first 50 videos)
- Exceed any platform's documented rate limits
- Use multiple accounts to bypass limits
