"""viral_mechanics.py — Viral psychology frameworks for scene planning.

Each framework maps a narrative arc that has proven traction on short-form
platforms. The orchestrator selects the best-fit framework per run and injects
it into the scene_planning system prompt.
"""
from __future__ import annotations

from typing import Any


# ---------------------------------------------------------------------------
# Framework definitions
# ---------------------------------------------------------------------------

VIRAL_FRAMEWORKS: dict[str, dict[str, Any]] = {
    "open_loop_payoff": {
        "name": "Open Loop → Payoff",
        "description": "Tease an unresolved question in the hook, withhold the answer, deliver it in the final scene.",
        "best_for": ["mystery", "reveals", "how-it-works", "secrets", "surprising facts"],
        "scene_structure": [
            "Hook: Open a loop with a bold question or unresolved claim that demands an answer.",
            "Build: Add context, tension, and evidence that makes the question more urgent.",
            "Rehook: Remind viewers the answer is coming — 'but here's where it gets wild...'",
            "Payoff: Deliver the answer/reveal. Close the loop completely. End with a CTA.",
        ],
        "injection": (
            "VIRAL FRAMEWORK: Open Loop → Payoff\n"
            "Scene 1 MUST open a loop — pose a question or bold claim that CANNOT be ignored.\n"
            "Middle scenes build urgency without giving the answer.\n"
            "Final scene MUST close the loop with the full reveal/answer + a direct CTA.\n"
            "The viewer must feel they CANNOT leave until they hear the answer."
        ),
    },
    "social_proof_revelation": {
        "name": "Social Proof → Revelation",
        "description": "Lead with surprising mass behavior or consensus, then reveal the counterintuitive truth.",
        "best_for": ["trends", "statistics", "contrarian takes", "industry exposés", "celebrity news"],
        "scene_structure": [
            "Hook: State surprising social proof — 'Millions of people do X every day...'",
            "Amplify: Show the scale, name big names, cite specific numbers.",
            "Pivot: 'But here's what nobody tells you about X...'",
            "Revelation: Deliver the hidden truth, flip the narrative. CTA to share.",
        ],
        "injection": (
            "VIRAL FRAMEWORK: Social Proof → Revelation\n"
            "Scene 1 MUST state a surprising fact about mass behavior or a well-known figure.\n"
            "Use specific numbers and names — vague claims kill retention.\n"
            "Middle scenes amplify the social proof and build credibility.\n"
            "Final scene delivers the counterintuitive revelation that reframes everything + CTA.\n"
            "The viewer must feel 'I need to share this.'"
        ),
    },
    "behind_the_scenes_pull": {
        "name": "Behind The Scenes → Pull",
        "description": "Grant exclusive access to a process, place, or decision that's normally hidden.",
        "best_for": ["tutorials", "brand stories", "process reveals", "insider access", "how things are made"],
        "scene_structure": [
            "Hook: Promise exclusive access — 'Nobody shows you what actually happens when...'",
            "Reveal 1: Show the first hidden layer — something slightly surprising.",
            "Reveal 2: Go deeper — the real secret that even insiders don't discuss.",
            "Pull: Invite the viewer in — CTA to join, follow, or act to get more access.",
        ],
        "injection": (
            "VIRAL FRAMEWORK: Behind The Scenes → Pull\n"
            "Scene 1 MUST promise exclusive or hidden access to something normally unseen.\n"
            "Each middle scene reveals a deeper layer — go from surface to insider truth.\n"
            "Final scene delivers the deepest reveal and invites the viewer in with a CTA.\n"
            "Tone should feel like a private tour, not a public broadcast.\n"
            "Use 'most people never see this' framing throughout."
        ),
    },
    "problem_agitate_solve": {
        "name": "Problem → Agitate → Solve",
        "description": "Name a painful problem, twist the knife by making it feel urgent, then deliver the solution.",
        "best_for": ["finance", "health", "productivity", "self-improvement", "how-to", "life hacks"],
        "scene_structure": [
            "Hook: State the problem boldly — call out who it affects and why it matters now.",
            "Agitate: Show the consequences of NOT solving it. Make the pain feel real and urgent.",
            "Agitate harder: 'And most people never figure this out because...'",
            "Solve: Deliver the solution clearly. Make it feel achievable. End with a CTA.",
        ],
        "injection": (
            "VIRAL FRAMEWORK: Problem → Agitate → Solve\n"
            "Scene 1 MUST name a specific, painful problem your audience is living right now.\n"
            "Middle scenes must agitate — show the cost of inaction, not just the problem.\n"
            "Build urgency: 'Every day you wait, this gets worse because...'\n"
            "Final scene delivers a clear, actionable solution + CTA.\n"
            "The viewer must feel relief when the solution arrives — earn that moment."
        ),
    },
}


# ---------------------------------------------------------------------------
# Framework selection
# ---------------------------------------------------------------------------

_FRAMEWORK_SIGNAL_WORDS: dict[str, list[str]] = {
    "open_loop_payoff": [
        "secret", "reveal", "why", "how", "truth", "reason", "mystery",
        "surprising", "nobody knows", "discover", "uncover", "find out",
    ],
    "social_proof_revelation": [
        "million", "billion", "percent", "everyone", "most people", "viral",
        "trending", "celebrity", "famous", "study", "research", "statistic",
        "data", "survey", "poll",
    ],
    "behind_the_scenes_pull": [
        "inside", "behind", "process", "how it works", "actually made",
        "tutorial", "step by step", "exclusive", "access", "never seen",
        "real story", "what happens",
    ],
    "problem_agitate_solve": [
        "problem", "mistake", "wrong", "stop", "fix", "hack", "tip",
        "avoid", "losing", "failing", "struggling", "broke", "tired",
        "frustrated", "help", "solution",
    ],
}


def select_framework(
    concept: dict[str, Any],
    trend_data: dict[str, Any] | None = None,
) -> str:
    """Select the best viral framework for this concept.

    Scores each framework by counting signal words found in the concept's
    hook, thesis, and visual direction. Falls back to 'open_loop_payoff'
    if no clear winner emerges.

    Returns the framework key (str).
    """
    hook = str(concept.get("hook", "")).lower()
    thesis = str(concept.get("thesis", "")).lower()
    visual = str(concept.get("visual_direction", "")).lower()
    cta = str(concept.get("cta", "")).lower()
    trend_hook = str((trend_data or {}).get("trend_hook", "")).lower()
    trend_angle = str((trend_data or {}).get("content_angle", "")).lower()

    combined = f"{hook} {thesis} {visual} {cta} {trend_hook} {trend_angle}"

    scores: dict[str, int] = {key: 0 for key in VIRAL_FRAMEWORKS}
    for framework_key, signals in _FRAMEWORK_SIGNAL_WORDS.items():
        for word in signals:
            if word in combined:
                scores[framework_key] += 1

    best = max(scores, key=lambda k: scores[k])

    # Require at least 1 signal match; otherwise use safe default
    if scores[best] == 0:
        return "open_loop_payoff"

    return best


def build_framework_injection(framework_key: str) -> str:
    """Return the system prompt injection string for the given framework.

    Includes the framework name, scene structure guide, and behavioral rules.
    Falls back to open_loop_payoff if an unknown key is passed.
    """
    framework = VIRAL_FRAMEWORKS.get(framework_key, VIRAL_FRAMEWORKS["open_loop_payoff"])

    structure_lines = "\n".join(
        f"  Scene {i + 1}: {beat}"
        for i, beat in enumerate(framework["scene_structure"])
    )

    return (
        f"VIRAL PSYCHOLOGY FRAMEWORK: {framework['name']}\n"
        f"{framework['injection']}\n\n"
        f"Recommended scene-by-scene arc:\n{structure_lines}"
    )
