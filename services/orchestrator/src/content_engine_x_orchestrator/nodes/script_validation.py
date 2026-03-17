"""script_validation.py — Grade scripts against proven viral short-form
frameworks. Acts as a QC gate that kills weak scripts before they waste
Sora credits.

Contains both the standalone utility functions and the LangGraph node wrapper.
"""
from __future__ import annotations

import math
import re
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

class SectionDetection(BaseModel):
    label: str
    text_preview: str
    position_pct: float


class Issue(BaseModel):
    severity: str  # "critical", "warning", "info"
    category: str
    message: str
    fix_suggestion: str


class ScriptScore(BaseModel):
    overall_score: float = 0.0
    passed: bool = False

    structure_score: float = 0.0
    readability_score: float = 0.0
    hook_strength_score: float = 0.0
    payoff_placement_score: float = 0.0
    loop_potential_score: float = 0.0
    visual_alignment_score: float = 0.0
    duration_score: float = 0.0
    engagement_trigger_score: float = 0.0

    grade_level: float = 0.0
    word_count: int = 0
    estimated_duration: float = 0.0

    sections_detected: list[SectionDetection] = Field(default_factory=list)
    issues: list[Issue] = Field(default_factory=list)
    revision_notes: str = ""
    loop_suggestion: str = ""


# ---------------------------------------------------------------------------
# Weights
# ---------------------------------------------------------------------------

WEIGHTS = {
    "structure": 0.25,
    "readability": 0.15,
    "hook_strength": 0.20,
    "payoff_placement": 0.15,
    "loop_potential": 0.10,
    "visual_alignment": 0.05,
    "duration": 0.05,
    "engagement_triggers": 0.05,
}


# ---------------------------------------------------------------------------
# Text utilities
# ---------------------------------------------------------------------------

def _count_syllables(word: str) -> int:
    """Estimate syllable count using a simple heuristic."""
    word = word.lower().strip()
    if not word:
        return 0
    if len(word) <= 3:
        return 1

    # Remove trailing silent e
    if word.endswith("e") and not word.endswith("le"):
        word = word[:-1]

    # Count vowel groups
    count = len(re.findall(r"[aeiouy]+", word))
    return max(1, count)


def _flesch_kincaid_grade(text: str) -> float:
    """Compute Flesch-Kincaid grade level.

    FK = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59
    """
    sentences = re.split(r"[.!?]+", text)
    sentences = [s.strip() for s in sentences if s.strip()]
    words = re.findall(r"[a-zA-Z]+", text)

    if not sentences or not words:
        return 0.0

    total_sentences = len(sentences)
    total_words = len(words)
    total_syllables = sum(_count_syllables(w) for w in words)

    grade = (
        0.39 * (total_words / total_sentences)
        + 11.8 * (total_syllables / total_words)
        - 15.59
    )
    return round(max(0.0, grade), 1)


def _word_count(text: str) -> int:
    return len(re.findall(r"\S+", text))


def _estimated_duration_seconds(text: str) -> float:
    """Estimate spoken duration at ~150 words per minute."""
    wc = _word_count(text)
    return round(wc / 150.0 * 60.0, 1)


# ---------------------------------------------------------------------------
# Script extraction from scenes
# ---------------------------------------------------------------------------

def extract_script(scenes: list[dict[str, Any]]) -> str:
    """Extract and join all scene narrations into a full script."""
    return " ".join(
        scene.get("narration", "")
        for scene in sorted(scenes, key=lambda s: s.get("ordinal", 0))
        if scene.get("narration")
    )


def _scene_narrations(scenes: list[dict[str, Any]]) -> list[str]:
    """Return ordered list of individual scene narrations."""
    return [
        scene.get("narration", "")
        for scene in sorted(scenes, key=lambda s: s.get("ordinal", 0))
        if scene.get("narration")
    ]


# ---------------------------------------------------------------------------
# Scoring: Structure (weight 0.25)
# ---------------------------------------------------------------------------

# Patterns for section detection
_REHOOK_PATTERNS = [
    r"but here'?s the thing",
    r"but why",
    r"but what",
    r"here'?s where it gets",
    r"the crazy part",
    r"what most people don'?t",
    r"but then",
    r"except",
    r"the twist",
    r"plot twist",
]

_PAYOFF_PATTERNS = [
    r"and that'?s why",
    r"turns out",
    r"so the (answer|truth|reason)",
    r"which means",
    r"the point is",
    r"and that'?s how",
    r"so basically",
    r"the takeaway",
    r"in other words",
    r"the result",
]


def _score_structure(
    script: str,
    narrations: list[str],
) -> tuple[float, list[SectionDetection], list[Issue]]:
    """Parse script into Hook -> Supporting Hook -> Context -> Rehook -> Payoff."""
    sections: list[SectionDetection] = []
    issues: list[Issue] = []
    score = 0.0

    if not narrations:
        issues.append(Issue(
            severity="critical",
            category="structure",
            message="No narration found in any scene.",
            fix_suggestion="Add narration text to at least one scene.",
        ))
        return 0.0, sections, issues

    total_len = len(script)
    if total_len == 0:
        return 0.0, sections, issues

    # Hook: first scene narration
    hook_text = narrations[0]
    hook_end_pct = len(hook_text) / total_len * 100
    sections.append(SectionDetection(
        label="hook",
        text_preview=hook_text[:80],
        position_pct=0.0,
    ))
    score += 25  # Hook present

    # Supporting hook: second narration if it exists
    if len(narrations) >= 2:
        sup_text = narrations[1]
        char_pos = len(narrations[0]) + 1
        sections.append(SectionDetection(
            label="supporting_hook",
            text_preview=sup_text[:80],
            position_pct=char_pos / total_len * 100,
        ))
        score += 15
    else:
        issues.append(Issue(
            severity="warning",
            category="structure",
            message="No supporting hook detected (only 1 scene).",
            fix_suggestion="Add a second scene that reinforces the hook.",
        ))

    # Rehook: look for rehook patterns in the 40-85% range
    script_lower = script.lower()
    rehook_found = False
    for pattern in _REHOOK_PATTERNS:
        match = re.search(pattern, script_lower)
        if match:
            pos_pct = match.start() / total_len * 100
            if 30 <= pos_pct <= 90:
                rehook_found = True
                sections.append(SectionDetection(
                    label="rehook",
                    text_preview=script[match.start():match.start() + 80],
                    position_pct=pos_pct,
                ))
                score += 25
                break

    if not rehook_found:
        issues.append(Issue(
            severity="warning",
            category="structure",
            message="No rehook detected in the middle of the script.",
            fix_suggestion=(
                "Add a pattern like 'but here's the thing' or 'the crazy part' "
                "between 40-85% of the script to re-engage viewers."
            ),
        ))

    # Payoff: look for payoff patterns in the last 25%
    payoff_found = False
    for pattern in _PAYOFF_PATTERNS:
        match = re.search(pattern, script_lower)
        if match:
            pos_pct = match.start() / total_len * 100
            if pos_pct >= 70:
                payoff_found = True
                sections.append(SectionDetection(
                    label="payoff",
                    text_preview=script[match.start():match.start() + 80],
                    position_pct=pos_pct,
                ))
                score += 25
            elif pos_pct < 70:
                payoff_found = True
                score += 10  # Partial credit — payoff exists but too early
                issues.append(Issue(
                    severity="critical",
                    category="structure",
                    message=f"Payoff detected at {pos_pct:.0f}% — too early. "
                            f"Must be in final 15% of script.",
                    fix_suggestion="Move the reveal/answer to the last scene.",
                ))
            break

    if not payoff_found:
        # Check if last narration has any conclusive language
        last_narr = narrations[-1].lower() if narrations else ""
        if any(w in last_narr for w in ["so", "that", "which", "because"]):
            score += 10
            sections.append(SectionDetection(
                label="payoff",
                text_preview=narrations[-1][:80],
                position_pct=90.0,
            ))
        else:
            issues.append(Issue(
                severity="warning",
                category="structure",
                message="No clear payoff/reveal detected.",
                fix_suggestion=(
                    "End with a pattern like 'and that's why...' or "
                    "'turns out...' to deliver the payoff."
                ),
            ))

    return min(100.0, score), sections, issues


# ---------------------------------------------------------------------------
# Scoring: Readability (weight 0.15)
# ---------------------------------------------------------------------------

_COMPLEX_WORD_REPLACEMENTS: dict[str, str] = {
    "utilize": "use",
    "implement": "build",
    "approximately": "about",
    "subsequently": "then",
    "nevertheless": "still",
    "furthermore": "also",
    "consequently": "so",
    "demonstrate": "show",
    "facilitate": "help",
    "comprehensive": "full",
    "significant": "big",
    "particularly": "especially",
    "essentially": "basically",
    "unfortunately": "sadly",
    "immediately": "right away",
    "specifically": "exactly",
    "additional": "more",
    "communication": "talk",
    "infrastructure": "setup",
    "methodology": "method",
}


def _score_readability(script: str) -> tuple[float, float, list[Issue]]:
    """Score readability via Flesch-Kincaid. Target: 5.0-8.0 grade."""
    issues: list[Issue] = []
    grade = _flesch_kincaid_grade(script)

    # Score based on grade level
    if 5.0 <= grade <= 8.0:
        score = 100.0
    elif grade < 5.0:
        score = 80.0  # Too simple is OK-ish
    elif grade <= 10.0:
        score = max(0.0, 100.0 - (grade - 8.0) * 25.0)
        issues.append(Issue(
            severity="warning",
            category="readability",
            message=f"Grade level {grade} is above target (5.0-8.0). "
                    f"Script may be too complex for short-form.",
            fix_suggestion="Simplify vocabulary and shorten sentences.",
        ))
    else:
        score = max(0.0, 100.0 - (grade - 8.0) * 20.0)
        issues.append(Issue(
            severity="critical",
            category="readability",
            message=f"Grade level {grade} is above 10th grade. "
                    f"Too complex for viral short-form content.",
            fix_suggestion="Rewrite using simpler words and shorter sentences.",
        ))

    # Flag specific complex words
    words = re.findall(r"[a-zA-Z]+", script.lower())
    found_complex = [
        w for w in words if w in _COMPLEX_WORD_REPLACEMENTS
    ]
    if found_complex:
        unique = list(dict.fromkeys(found_complex))  # preserve order, dedupe
        replacements = [
            f"'{w}' -> '{_COMPLEX_WORD_REPLACEMENTS[w]}'"
            for w in unique[:5]
        ]
        issues.append(Issue(
            severity="info",
            category="readability",
            message=f"Found complex words: {', '.join(unique[:5])}",
            fix_suggestion=f"Replace: {'; '.join(replacements)}",
        ))

    return score, grade, issues


# ---------------------------------------------------------------------------
# Scoring: Hook Strength (weight 0.20)
# ---------------------------------------------------------------------------

_CURIOSITY_GAP_PATTERNS = [
    r"you won'?t believe",
    r"here'?s (why|what|how)",
    r"the (real|actual|true) reason",
    r"nobody (talks|knows) about",
    r"(secret|hidden|little[- ]known)",
    r"what (if|happens)",
    r"stop scrolling",
    r"did you know",
    r"\?",  # questions create curiosity
]

_EMOTIONAL_PATTERNS = [
    r"(insane|crazy|wild|shocking|unbelievable)",
    r"(terrifying|heartbreaking|devastating)",
    r"(genius|brilliant|legendary|iconic)",
    r"(exposed|caught|busted|revealed)",
]


def _score_hook_strength(first_narration: str) -> tuple[float, list[Issue]]:
    """Score the first scene's narration as a hook."""
    issues: list[Issue] = []
    score = 0.0

    if not first_narration.strip():
        issues.append(Issue(
            severity="critical",
            category="hook_strength",
            message="First scene has no narration — no hook.",
            fix_suggestion="Write a punchy opening line under 15 words.",
        ))
        return 0.0, issues

    hook_lower = first_narration.lower()
    hook_words = _word_count(first_narration)

    # Curiosity gap check (+25)
    has_curiosity = any(
        re.search(p, hook_lower) for p in _CURIOSITY_GAP_PATTERNS
    )
    if has_curiosity:
        score += 25
    else:
        issues.append(Issue(
            severity="warning",
            category="hook_strength",
            message="No curiosity gap detected in hook.",
            fix_suggestion=(
                "Open with a question, a 'here's why' pattern, or a bold "
                "claim that makes the viewer need to watch."
            ),
        ))

    # Specific claims / numbers / names (+20)
    has_specifics = bool(
        re.search(r"\d+", first_narration)
        or re.search(r"[A-Z][a-z]+(?:\s[A-Z][a-z]+)+", first_narration)
    )
    if has_specifics:
        score += 20
    else:
        issues.append(Issue(
            severity="info",
            category="hook_strength",
            message="Hook lacks specific numbers or names.",
            fix_suggestion="Add a concrete number, name, or claim for credibility.",
        ))

    # Emotional / controversial language (+20)
    has_emotion = any(
        re.search(p, hook_lower) for p in _EMOTIONAL_PATTERNS
    )
    if has_emotion:
        score += 20

    # Punchy length under 15 words (+15)
    if hook_words <= 15:
        score += 15
    elif hook_words <= 25:
        score += 8
        issues.append(Issue(
            severity="info",
            category="hook_strength",
            message=f"Hook is {hook_words} words — aim for under 15.",
            fix_suggestion="Tighten the hook. Cut filler words.",
        ))
    else:
        issues.append(Issue(
            severity="warning",
            category="hook_strength",
            message=f"Hook is {hook_words} words — too long for short-form.",
            fix_suggestion="Rewrite hook to under 15 words. "
                           "Every extra word loses viewers.",
        ))

    # Baseline points for having a hook at all
    score += 20

    # Check minimum hook score
    if score < 60:
        issues.append(Issue(
            severity="critical",
            category="hook_strength",
            message=f"Hook score {score:.0f} is below minimum threshold (60).",
            fix_suggestion="Rewrite the first scene narration with a curiosity "
                           "gap, specific claim, and emotional language.",
        ))

    return min(100.0, score), issues


# ---------------------------------------------------------------------------
# Scoring: Payoff Placement (weight 0.15)
# ---------------------------------------------------------------------------

def _score_payoff_placement(
    script: str,
    narrations: list[str],
) -> tuple[float, list[Issue]]:
    """The reveal/answer MUST be in the final 15% of the script."""
    issues: list[Issue] = []

    if not script:
        return 0.0, issues

    total_len = len(script)
    script_lower = script.lower()

    # Find the last payoff pattern
    last_payoff_pct = None
    for pattern in _PAYOFF_PATTERNS:
        for match in re.finditer(pattern, script_lower):
            pos_pct = match.start() / total_len * 100
            if last_payoff_pct is None or pos_pct > last_payoff_pct:
                last_payoff_pct = pos_pct

    if last_payoff_pct is None:
        # No explicit payoff pattern — check if last narration is conclusive
        if narrations:
            last = narrations[-1].lower()
            if any(w in last for w in [
                "so", "that's", "which means", "the point",
            ]):
                return 70.0, issues
        issues.append(Issue(
            severity="warning",
            category="payoff_placement",
            message="No payoff/reveal pattern detected anywhere in script.",
            fix_suggestion="End with 'and that's why...', 'turns out...', or "
                           "a clear reveal statement.",
        ))
        return 30.0, issues

    if last_payoff_pct >= 85:
        return 100.0, issues
    elif last_payoff_pct >= 75:
        return 80.0, issues
    elif last_payoff_pct >= 60:
        issues.append(Issue(
            severity="warning",
            category="payoff_placement",
            message=f"Payoff at {last_payoff_pct:.0f}% — should be in final 15%.",
            fix_suggestion="Move the reveal later. Build more tension first.",
        ))
        return 50.0, issues
    else:
        issues.append(Issue(
            severity="critical",
            category="payoff_placement",
            message=f"Payoff at {last_payoff_pct:.0f}% — way too early. "
                    f"Viewers will swipe away after getting the answer.",
            fix_suggestion="Restructure: tease the answer, build context, "
                           "then reveal in the last scene only.",
        ))
        return 20.0, issues


# ---------------------------------------------------------------------------
# Scoring: Loop Potential (weight 0.10)
# ---------------------------------------------------------------------------

_HARD_ENDING_PATTERNS = [
    r"thanks for watching",
    r"like and subscribe",
    r"follow for more",
    r"that'?s (all|it) for",
    r"see you (next|in the)",
    r"peace out",
    r"bye",
    r"comment below",
    r"let me know",
]


def _score_loop_potential(
    narrations: list[str],
) -> tuple[float, str, list[Issue]]:
    """Check if the last narration can loop back to the first."""
    issues: list[Issue] = []
    suggestion = ""

    if len(narrations) < 2:
        return 50.0, "", issues

    first = narrations[0].lower()
    last = narrations[-1].lower()

    score = 50.0  # baseline

    # Penalize hard endings
    for pattern in _HARD_ENDING_PATTERNS:
        if re.search(pattern, last):
            score -= 30
            issues.append(Issue(
                severity="critical",
                category="loop_potential",
                message=f"Hard ending detected: '{re.search(pattern, last).group()}'."
                        f" This kills loop retention.",
                fix_suggestion="Remove the sign-off. End on the content, not a "
                               "goodbye. The last line should connect back to "
                               "the hook.",
            ))
            break

    # Check semantic connection between last and first
    first_words = set(re.findall(r"[a-z]+", first))
    last_words = set(re.findall(r"[a-z]+", last))
    # Remove common stopwords
    stopwords = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "can", "shall", "to", "of", "in", "for",
        "on", "with", "at", "by", "from", "it", "its", "this", "that",
        "and", "or", "but", "not", "no", "if", "so", "as", "up", "out",
    }
    first_meaningful = first_words - stopwords
    last_meaningful = last_words - stopwords
    overlap = first_meaningful & last_meaningful

    if overlap:
        score += 30
        suggestion = (
            f"Good loop potential — shared concepts: {', '.join(list(overlap)[:5])}. "
            f"Consider ending with a line that directly echoes the hook."
        )
    else:
        score += 0
        suggestion = (
            f"Weak loop. Try ending with a line that references the hook: "
            f"'{narrations[0][:50]}...'. Mirror a word or phrase from it."
        )
        issues.append(Issue(
            severity="info",
            category="loop_potential",
            message="Last line doesn't connect back to the hook.",
            fix_suggestion=suggestion,
        ))

    # Bonus if last line ends on a cliffhanger or question
    if last.rstrip().endswith("?") or last.rstrip().endswith("..."):
        score += 20
        suggestion = "Loop-friendly ending detected (question or cliffhanger)."

    return min(100.0, max(0.0, score)), suggestion, issues


# ---------------------------------------------------------------------------
# Scoring: Visual Alignment (weight 0.05)
# ---------------------------------------------------------------------------

_ACTION_PATTERNS = [
    r"\b(walks?|runs?|jumps?|falls?|stands?|sits?|looks?|turns?)\b",
    r"\b(shows?|reveals?|opens?|closes?|holds?|grabs?|throws?)\b",
    r"\b(smiles?|cries?|laughs?|screams?|whispers?)\b",
]

_PERSON_PATTERNS = [
    r"\b(he|she|they|person|man|woman|people|someone)\b",
    r"\b(face|eyes|hands?|body)\b",
]


def _score_visual_alignment(
    scenes: list[dict[str, Any]],
) -> tuple[float, list[Issue]]:
    """Check each scene's narration against its visual_beat field."""
    issues: list[Issue] = []

    if not scenes:
        return 100.0, issues

    total = len(scenes)
    aligned = 0

    for scene in scenes:
        narr = (scene.get("narration") or "").lower()
        beat = (scene.get("visual_beat") or "").lower()
        ordinal = scene.get("ordinal", "?")

        if not narr:
            continue

        # Check if narration mentions people or actions
        mentions_action = any(re.search(p, narr) for p in _ACTION_PATTERNS)
        mentions_person = any(re.search(p, narr) for p in _PERSON_PATTERNS)

        if (mentions_action or mentions_person) and not beat:
            issues.append(Issue(
                severity="warning",
                category="visual_alignment",
                message=f"Scene {ordinal}: narration describes actions/people "
                        f"but visual_beat is empty.",
                fix_suggestion=f"Add a visual_beat for scene {ordinal} that "
                               f"matches the narration.",
            ))
        elif (mentions_action or mentions_person) and beat:
            # Check if beat has any relevant motion/person keywords
            beat_relevant = any(
                re.search(p, beat) for p in _ACTION_PATTERNS + _PERSON_PATTERNS
            ) or any(w in beat for w in [
                "motion", "movement", "close-up", "wide", "pan", "zoom",
                "tracking", "cinematic", "frame",
            ])
            if beat_relevant:
                aligned += 1
            else:
                issues.append(Issue(
                    severity="info",
                    category="visual_alignment",
                    message=f"Scene {ordinal}: narration mentions actions but "
                            f"visual_beat may not match.",
                    fix_suggestion=f"Review visual_beat for scene {ordinal}.",
                ))
                aligned += 1  # partial credit
        else:
            aligned += 1  # no action/person reference — alignment not required

    score = (aligned / total * 100) if total > 0 else 100.0
    return score, issues


# ---------------------------------------------------------------------------
# Scoring: Duration (weight 0.05)
# ---------------------------------------------------------------------------

def _score_duration(
    scenes: list[dict[str, Any]],
) -> tuple[float, list[Issue]]:
    """Sum duration_seconds across all scenes. Target 35-45 seconds."""
    issues: list[Issue] = []
    total_duration = sum(
        scene.get("duration_seconds", 0) for scene in scenes
    )

    if total_duration == 0:
        issues.append(Issue(
            severity="critical",
            category="duration",
            message="Total duration is 0 seconds.",
            fix_suggestion="Set duration_seconds on each scene.",
        ))
        return 0.0, issues

    if 35 <= total_duration <= 45:
        return 100.0, issues
    elif 25 <= total_duration < 35:
        issues.append(Issue(
            severity="warning",
            category="duration",
            message=f"Total duration {total_duration}s is short. "
                    f"Target 35-45s for YouTube Shorts.",
            fix_suggestion="Add more content or extend scene durations.",
        ))
        return 70.0, issues
    elif 45 < total_duration <= 60:
        issues.append(Issue(
            severity="info",
            category="duration",
            message=f"Total duration {total_duration}s is slightly long. "
                    f"Target 35-45s for optimal retention.",
            fix_suggestion="Trim filler or reduce scene durations.",
        ))
        return 75.0, issues
    elif total_duration < 25:
        issues.append(Issue(
            severity="critical",
            category="duration",
            message=f"Total duration {total_duration}s is too short (<25s).",
            fix_suggestion="Expand content. Add scenes or extend durations.",
        ))
        return 30.0, issues
    else:
        issues.append(Issue(
            severity="warning",
            category="duration",
            message=f"Total duration {total_duration}s exceeds 60s.",
            fix_suggestion="Cut aggressively. Remove the weakest scene entirely.",
        ))
        return 40.0, issues


# ---------------------------------------------------------------------------
# Scoring: Engagement Triggers (weight 0.05)
# ---------------------------------------------------------------------------

_ENGAGEMENT_TRIGGER_PATTERNS = [
    (r"\?", "rhetorical question"),
    (r"comment (below|if|what|your)", "comment bait"),
    (r"(would you|have you|do you|can you)", "viewer involvement"),
    (r"(save this|share this|send this)", "narrative CTA"),
    (r"(bet you|prove me wrong|change my mind)", "viewer challenge"),
    (r"(tag someone|@ someone|tell your)", "social prompt"),
    (r"(what do you think|agree or disagree)", "opinion poll"),
]


def _score_engagement_triggers(script: str) -> tuple[float, list[Issue]]:
    """Check for comment bait, rhetorical questions, etc."""
    issues: list[Issue] = []
    script_lower = script.lower()

    found_triggers: list[str] = []
    for pattern, label in _ENGAGEMENT_TRIGGER_PATTERNS:
        if re.search(pattern, script_lower):
            found_triggers.append(label)

    if not found_triggers:
        issues.append(Issue(
            severity="warning",
            category="engagement_triggers",
            message="No engagement triggers found in script.",
            fix_suggestion=(
                "Add at least one: a rhetorical question, viewer challenge, "
                "or narrative CTA like 'save this and send it to...'."
            ),
        ))
        return 20.0, issues

    if len(found_triggers) >= 3:
        return 100.0, issues
    elif len(found_triggers) >= 2:
        return 85.0, issues
    else:
        return 65.0, issues


# ---------------------------------------------------------------------------
# Main validation function
# ---------------------------------------------------------------------------

def validate_script(scenes: list[dict[str, Any]]) -> ScriptScore:
    """Grade a script extracted from state['scenes'] against proven
    viral short-form frameworks.

    The script is the concatenation of the 'narration' field from each
    scene dict in the scenes list, ordered by 'ordinal'.

    Returns a ScriptScore with overall score, sub-scores, detected
    sections, issues, and revision notes.
    """
    narrations = _scene_narrations(scenes)
    script = extract_script(scenes)
    word_count = _word_count(script)
    est_duration = _estimated_duration_seconds(script)
    all_issues: list[Issue] = []

    # 1. Structure
    structure_score, sections, structure_issues = _score_structure(
        script, narrations,
    )
    all_issues.extend(structure_issues)

    # 2. Readability
    readability_score, grade_level, readability_issues = _score_readability(
        script,
    )
    all_issues.extend(readability_issues)

    # 3. Hook strength
    first_narration = narrations[0] if narrations else ""
    hook_score, hook_issues = _score_hook_strength(first_narration)
    all_issues.extend(hook_issues)

    # 4. Payoff placement
    payoff_score, payoff_issues = _score_payoff_placement(script, narrations)
    all_issues.extend(payoff_issues)

    # 5. Loop potential
    loop_score, loop_suggestion, loop_issues = _score_loop_potential(narrations)
    all_issues.extend(loop_issues)

    # 6. Visual alignment
    visual_score, visual_issues = _score_visual_alignment(scenes)
    all_issues.extend(visual_issues)

    # 7. Duration
    duration_score, duration_issues = _score_duration(scenes)
    all_issues.extend(duration_issues)

    # 8. Engagement triggers
    trigger_score, trigger_issues = _score_engagement_triggers(script)
    all_issues.extend(trigger_issues)

    # Weighted composite
    overall = (
        structure_score * WEIGHTS["structure"]
        + readability_score * WEIGHTS["readability"]
        + hook_score * WEIGHTS["hook_strength"]
        + payoff_score * WEIGHTS["payoff_placement"]
        + loop_score * WEIGHTS["loop_potential"]
        + visual_score * WEIGHTS["visual_alignment"]
        + duration_score * WEIGHTS["duration"]
        + trigger_score * WEIGHTS["engagement_triggers"]
    )
    overall = round(overall, 1)
    passed = overall >= 70

    # Build revision notes if failed
    revision_notes = ""
    if not passed:
        critical = [i for i in all_issues if i.severity == "critical"]
        warnings = [i for i in all_issues if i.severity == "warning"]
        notes_parts = []
        if critical:
            notes_parts.append(
                "CRITICAL fixes needed:\n"
                + "\n".join(f"  - [{i.category}] {i.fix_suggestion}"
                            for i in critical)
            )
        if warnings:
            notes_parts.append(
                "Warnings:\n"
                + "\n".join(f"  - [{i.category}] {i.fix_suggestion}"
                            for i in warnings)
            )
        revision_notes = "\n\n".join(notes_parts)

    return ScriptScore(
        overall_score=overall,
        passed=passed,
        structure_score=structure_score,
        readability_score=readability_score,
        hook_strength_score=hook_score,
        payoff_placement_score=payoff_score,
        loop_potential_score=loop_score,
        visual_alignment_score=visual_score,
        duration_score=duration_score,
        engagement_trigger_score=trigger_score,
        grade_level=grade_level,
        word_count=word_count,
        estimated_duration=est_duration,
        sections_detected=sections,
        issues=all_issues,
        revision_notes=revision_notes,
        loop_suggestion=loop_suggestion,
    )


# ---------------------------------------------------------------------------
# LangGraph node wrapper
# ---------------------------------------------------------------------------

from ..models import JobStatus, WorkflowStage
from ..state import WorkflowState, append_audit_event, append_stage_attempt


def script_validation_node(state: WorkflowState) -> WorkflowState:
    """LangGraph node for script validation.

    Extracts the full script from state["scenes"], runs validate_script(),
    and writes results to the script_* state fields.

    If the script fails (overall < 70), increments script_revision_count
    and populates script_revision_notes so scene_planning can revise.
    """
    scenes = state.get("scenes", [])
    result = validate_script(scenes)
    score_dict = result.model_dump(mode="json")

    revision_count = state.get("script_revision_count", 0)

    update: WorkflowState = {
        "current_stage": WorkflowStage.SCRIPT_VALIDATION.value,
        "script_score": score_dict,
        "script_approved": result.passed,
        "stage_attempts": append_stage_attempt(
            state, WorkflowStage.SCRIPT_VALIDATION, JobStatus.COMPLETED,
        ),
    }

    if not result.passed:
        update["script_revision_notes"] = result.revision_notes
        update["script_revision_count"] = revision_count + 1
    else:
        update["script_revision_notes"] = ""

    update["audit_log"] = append_audit_event(
        state,
        action="script.validated",
        entity_type="scene",
        stage=WorkflowStage.SCRIPT_VALIDATION,
        metadata={
            "overall_score": result.overall_score,
            "passed": result.passed,
            "revision_count": update.get("script_revision_count", revision_count),
        },
    )

    return update
