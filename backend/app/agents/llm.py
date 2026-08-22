"""LLM access layer: Sail (OpenAI-compatible) for GLM analyst calls, and an
invented-number guard — a rationale may only cite numbers present in its
input packet. The model interprets; it never computes and never decides.
"""

import json
import re

from .. import config

BANNED_HYPE = ("guaranteed", "moon", "can't lose", "free money")


def _num_forms(x: float) -> set[str]:
    forms = {f"{x:g}"}
    try:
        forms.add(f"{x:.0f}")
        forms.add(f"{x:.1f}")
        forms.add(f"{x:.2f}")
        forms.add(f"{x:,.0f}")
        if 0 < abs(x) <= 1:
            forms.add(f"{x*100:.0f}")   # percent rendering
            forms.add(f"{x*100:.1f}")
    except (ValueError, OverflowError):
        pass
    return forms


def packet_numbers(packet: dict) -> set[str]:
    allowed = set()

    def walk(v):
        if isinstance(v, bool):
            return
        if isinstance(v, (int, float)):
            allowed.update(_num_forms(float(v)))
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, (list, tuple)):
            for x in v:
                walk(x)
    walk(packet)
    return allowed


def invented_numbers(text: str, packet: dict, extra_text: str = "") -> list[str]:
    """Numbers in the text that appear nowhere in the packet (any rendering)
    nor in extra_text (e.g. thresholds quoted from the analyst's own role
    instructions). Small window constants (1h/4h/15m) are always allowed."""
    allowed = packet_numbers(packet)
    allowed |= {"1", "4", "15", "24", "0", "1.0", "0.0"}
    for tok in re.findall(r"-?\d[\d,]*\.?\d*", extra_text):
        try:
            allowed |= _num_forms(float(tok.rstrip(".").replace(",", "")))
        except ValueError:
            continue
    found = re.findall(r"-?\d[\d,]*\.?\d*", text)
    bad = []
    for tok in found:
        clean = tok.rstrip(".").replace(",", "")
        try:
            forms = _num_forms(float(clean))
        except ValueError:
            continue
        if not (forms & allowed) and tok.replace(",", "") not in allowed:
            bad.append(tok)
    return bad


def parse_json_block(text: str) -> dict | None:
    """Extract the last {...} from a response, tolerating code fences."""
    matches = re.findall(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", text, re.DOTALL)
    for candidate in reversed(matches):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    return None


async def complete(system: str, user: str, max_tokens: int = 400) -> str | None:
    if not config.SAIL_API_KEY:
        return None
    import httpx
    url = config.LLM_BASE_URL.rstrip("/") + "/chat/completions"
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {config.SAIL_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": config.LLM_MODEL,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "max_tokens": max_tokens,
                    "temperature": 0.3,
                    # GLM-5.2 thinks by default; thinking ate the token budget
                    # and left content empty. Analysts need a direct JSON reply.
                    "reasoning_effort": "none",
                },
            )
            resp.raise_for_status()
            msg = resp.json()["choices"][0]["message"]
            return msg.get("content") or None
    except Exception:
        return None
