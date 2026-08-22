"""Deterministic supervisor. Combines analyst votes into a score; the trade
decision is arithmetic, never an LLM output. One optional LLM call writes a
human-readable synthesis sentence for the UI after the decision is made.
"""

from .llm import complete
from ..obs.bt import traced

WEIGHTS = {"influence_flow": 2.0, "whale": 1.5,
           "flow_imbalance": 1.0, "momentum": 1.0, "microstructure": 1.0}
_SIGN = {"long_yes": 1, "long_no": -1, "flat": 0}


def combine(votes: list[dict]) -> dict:
    score = sum(WEIGHTS.get(v["name"], 1.0) * v["confidence"] * _SIGN[v["stance"]]
                for v in votes)
    max_score = sum(WEIGHTS.values())
    norm = round(score / max_score, 3) if max_score else 0.0
    direction = "long_yes" if norm > 0 else ("long_no" if norm < 0 else "flat")
    return {"score": norm, "direction": direction, "votes": votes}


@traced("supervisor_synthesis")
async def synthesize(decision: dict, market: dict) -> str:
    stances = ", ".join(f'{v["name"]}:{v["stance"]}({v["confidence"]})'
                        for v in decision["votes"])
    text = await complete(
        "You write one sentence summarizing a trading crew's round for a dashboard. "
        "State the outcome plainly; no hype; do not invent numbers.",
        f'Market: {market["question"]}. Votes: {stances}. '
        f'Combined score {decision["score"]:+.2f}. Action: {decision.get("action", "HOLD")}.',
        max_tokens=90,
    )
    return (text or f'score {decision["score"]:+.2f} -> {decision.get("action", "HOLD")}').strip()
