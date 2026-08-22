"""Deterministic gate between the decision layer and the paper ledger.

The LLM layer proposes; this module disposes. No ticket reaches the ledger
without passing every check, and "no edge -> HOLD" is a first-class outcome.
"""

from .. import config

MAX_TICKET_USD = 50.0
MAX_POSITIONS_PER_MARKET = 2
MIN_SCORE = config.MIN_SCORE
LIFETIME_NOTIONAL_CAP = 500.0


def gate(decision: dict, universe: set[str], engine, journaled_notional: float,
         max_ticket: float = MAX_TICKET_USD) -> dict:
    """decision: {score, action, ticket|None}. Returns
    {action: "TRADE"|"HOLD", reasons: [...], ticket|None}.
    max_ticket is the deterministic size cap from the walk-forward IC rule."""
    reasons = []
    score = decision.get("score", 0.0)
    ticket = decision.get("ticket")

    if abs(score) < MIN_SCORE:
        return {"action": "HOLD", "reasons": [f"score {score:+.2f} below threshold {MIN_SCORE}"],
                "ticket": None}
    if not ticket:
        return {"action": "HOLD", "reasons": ["no ticket proposed"], "ticket": None}

    if ticket["market_id"] not in universe:
        reasons.append(f"market {ticket['market_id'][:10]} not in discovered universe")
    if ticket["notional_usd"] > max_ticket:
        # size down instead of rejecting: the IC rule caps, the trade survives
        ticket = {**ticket, "notional_usd": max_ticket}
        reasons_note = f"sized to ${max_ticket:.0f} by walk-forward IC rule"
    else:
        reasons_note = None
    if ticket["notional_usd"] > MAX_TICKET_USD:
        reasons.append(f"ticket ${ticket['notional_usd']:.0f} exceeds ${MAX_TICKET_USD:.0f} cap")
    if ticket["notional_usd"] <= 0:
        reasons.append("non-positive notional")
    n_in_market = sum(1 for p in engine.positions.values()
                      if p.market_id == ticket["market_id"])
    if ticket["side"] == "BUY" and n_in_market >= MAX_POSITIONS_PER_MARKET:
        reasons.append(f"already {n_in_market} positions in market")
    if ticket["side"] == "BUY" and journaled_notional + ticket["notional_usd"] > LIFETIME_NOTIONAL_CAP:
        reasons.append(f"lifetime notional cap ${LIFETIME_NOTIONAL_CAP:.0f} reached")
    if ticket["side"] == "BUY" and ticket["notional_usd"] > engine.cash:
        reasons.append("insufficient paper cash")

    if reasons:
        return {"action": "HOLD", "reasons": reasons, "ticket": None}
    ok = [f"score {score:+.2f} cleared all gates"]
    if reasons_note:
        ok.append(reasons_note)
    return {"action": "TRADE", "reasons": ok, "ticket": ticket}
