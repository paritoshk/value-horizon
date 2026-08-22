"""Five analyst agents, one per market attribute. Each receives a packet of
pre-computed numbers only and returns strict JSON:
  {"stance": "long_yes"|"long_no"|"flat", "confidence": 0..1, "rationale": str}

A rationale citing numbers not present in the packet is rejected and the
analyst is forced flat for the round — hallucinated evidence never reaches
the supervisor.
"""

from .llm import complete, invented_numbers, parse_json_block
from ..obs.bt import traced

ANALYSTS = ["influence_flow", "flow_imbalance", "whale", "momentum", "microstructure"]

_ROLE = {
    "influence_flow": (
        "You read the influence-flow signal: the z-scored net buying of wallets that a "
        "lead-lag graph + permutation null + ablation attribution marked as influential. "
        "Positive z = influential wallets are net buying YES. |z| > 1.5 is notable, > 2.5 strong."),
    "flow_imbalance": (
        "You read raw order-flow imbalance: (buys - sells) / total notional over recent windows. "
        "Sustained imbalance beyond +/-0.3 with decent trade count is meaningful; near 0 is noise."),
    "whale": (
        "You read whale flow: net signed notional of top-decile-size fills. A few very large "
        "one-sided fills matter more than many small ones; compare largest fill to the mean."),
    "momentum": (
        "You read price momentum and the structural-change detector (CUSUM + variance-burst). "
        "A live detector trigger or sustained 1h/4h drift matters; quiet detector = stand down."),
    "microstructure": (
        "You read the order book: spread, bid/ask, and where the mid sits in the 0-1 probability "
        "band. Wide spreads (>3 cents) make entries expensive; near 0.03/0.97 markets are pinned."),
}

_SYSTEM = (
    "You are the {name} analyst in a trading crew for one prediction market. {role}\n"
    "You will get a JSON packet of pre-computed numbers. You must not compute new numbers "
    "and must not cite any number that is not in the packet. Reply with ONLY one JSON object: "
    '{{"stance": "long_yes"|"long_no"|"flat", "confidence": <0..1>, "rationale": "<one or two '
    'sentences citing only packet numbers>"}}. When evidence is weak, say flat with low confidence.'
)

FLAT = {"stance": "flat", "confidence": 0.0, "rationale": "no signal"}


@traced("analyst")
async def run_analyst(name: str, packet: dict) -> dict:
    import json
    text = await complete(
        _SYSTEM.format(name=name, role=_ROLE[name]),
        json.dumps(packet, default=str),
    )
    if not text:
        return {"name": name, **FLAT, "rationale": "(llm unavailable — flat)"}
    parsed = parse_json_block(text)
    if not parsed or parsed.get("stance") not in ("long_yes", "long_no", "flat"):
        return {"name": name, **FLAT, "rationale": "(unparseable — flat)"}
    bad = invented_numbers(str(parsed.get("rationale", "")), packet)
    if bad:
        return {"name": name, **FLAT,
                "rationale": f"(guard tripped: invented numbers {bad[:3]} — flat)"}
    conf = max(0.0, min(1.0, float(parsed.get("confidence", 0))))
    return {"name": name, "stance": parsed["stance"], "confidence": round(conf, 2),
            "rationale": str(parsed.get("rationale", ""))[:400]}


def build_packet(name: str, market: dict, signals: dict) -> dict:
    """Compact numeric packet per analyst from precomputed signal blocks."""
    base = {"question": market["question"], "yes_mid": market.get("mid")}
    s = signals
    if name == "influence_flow":
        return {**base, **s.get("flow", {}), "n_influential_wallets": s.get("n_influential", 0),
                "model_oob_r2": s.get("oob_r2")}
    if name == "flow_imbalance":
        return {**base, "w15m": s.get("imb_15m", {}), "w1h": s.get("imb_1h", {})}
    if name == "whale":
        return {**base, **s.get("whale", {})}
    if name == "momentum":
        return {**base, **s.get("momentum", {}), "detector": s.get("detector", "quiet"),
                "cusum_stat": s.get("cusum_stat", 0.0)}
    return {**base, "bid": s.get("bid"), "ask": s.get("ask"), "spread": s.get("spread")}
