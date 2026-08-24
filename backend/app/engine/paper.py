"""Paper-trading ledger with pessimistic fills against the live book.

Doctrine: a BUY fills at the live best ask, a SELL at the live best bid,
never at mid, never inside the spread. Longs are marked at the bid
(liquidation value). The fill model is the result — optimistic fills
fabricate edge.
"""

import time
from dataclasses import dataclass, field


def fill_price(book: dict, side: str) -> float | None:
    """book: {"bid": float|None, "ask": float|None}. Pure, unit-tested."""
    px = book.get("ask") if side == "BUY" else book.get("bid")
    if px is None:
        return None
    return float(px)


@dataclass
class Position:
    market_id: str
    question: str
    outcome: str
    token_id: str
    qty: float
    avg_cost: float
    opened_ts: float


@dataclass
class PaperEngine:
    cash: float = 1000.0
    start_equity: float = 1000.0
    positions: dict = field(default_factory=dict)   # token_id -> Position
    trades: list = field(default_factory=list)       # closed+open trade events
    pnl_curve: list = field(default_factory=list)    # [{ts, equity}]
    realized: float = 0.0

    def execute(self, ticket: dict, book: dict, now: float | None = None) -> dict | None:
        """ticket: {market_id, question, outcome, token_id, side, notional_usd}.
        Returns the trade event dict or None if unfillable."""
        now = now or time.time()
        px = fill_price(book, ticket["side"])
        if px is None or px <= 0 or px >= 1:
            return None
        # entry sanity: never open in a pinned/degenerate book — a 0.1c ask on a
        # drifted market is not a fill, it's a data artifact
        if ticket["side"] == "BUY":
            bid = book.get("bid")
            if px < 0.05 or px > 0.95 or bid is None or (px - bid) > 0.05:
                return None
        if ticket["side"] == "BUY":
            qty = ticket["notional_usd"] / px
            if ticket["notional_usd"] > self.cash:
                return None
            self.cash -= ticket["notional_usd"]
            pos = self.positions.get(ticket["token_id"])
            if pos:
                total = pos.qty * pos.avg_cost + qty * px
                pos.qty += qty
                pos.avg_cost = total / pos.qty
            else:
                self.positions[ticket["token_id"]] = Position(
                    market_id=ticket["market_id"], question=ticket["question"],
                    outcome=ticket["outcome"], token_id=ticket["token_id"],
                    qty=qty, avg_cost=px, opened_ts=now)
            event = {"type": "trade_open", "ts": now, "side": "BUY", "qty": round(qty, 2),
                     "fill_px": px, **{k: ticket[k] for k in
                     ("market_id", "question", "outcome", "token_id")}}
        else:  # SELL closes (partial or full) an existing long
            pos = self.positions.get(ticket["token_id"])
            if not pos or pos.qty <= 0:
                return None
            qty = min(pos.qty, ticket["notional_usd"] / px)
            self.cash += qty * px
            pnl = qty * (px - pos.avg_cost)
            self.realized += pnl
            pos.qty -= qty
            if pos.qty <= 1e-9:
                del self.positions[ticket["token_id"]]
            event = {"type": "trade_close", "ts": now, "side": "SELL", "qty": round(qty, 2),
                     "fill_px": px, "pnl": round(pnl, 2), **{k: ticket[k] for k in
                     ("market_id", "question", "outcome", "token_id")}}
        self.trades.append(event)
        return event

    def mark(self, books: dict, now: float | None = None) -> dict:
        """books: token_id -> {"bid","ask"}. Marks longs at bid."""
        now = now or time.time()
        unreal = 0.0
        value = 0.0
        for tid, pos in self.positions.items():
            bid = (books.get(tid) or {}).get("bid")
            mark = float(bid) if bid is not None else pos.avg_cost
            value += pos.qty * mark
            unreal += pos.qty * (mark - pos.avg_cost)
        equity = self.cash + value
        self.pnl_curve.append({"ts": now, "equity": round(equity, 2)})
        self.pnl_curve = self.pnl_curve[-2000:]
        return {"cash": round(self.cash, 2), "equity": round(equity, 2),
                "realized": round(self.realized, 2), "unrealized": round(unreal, 2)}

    def to_dict(self) -> dict:
        return {"cash": self.cash, "start_equity": self.start_equity,
                "realized": self.realized,
                "positions": {t: vars(p) for t, p in self.positions.items()},
                "trades": self.trades[-200:], "pnl_curve": self.pnl_curve[-2000:]}

    @classmethod
    def from_dict(cls, d: dict) -> "PaperEngine":
        eng = cls(cash=d["cash"], start_equity=d.get("start_equity", 1000.0),
                  realized=d.get("realized", 0.0))
        eng.positions = {t: Position(**p) for t, p in d.get("positions", {}).items()}
        eng.trades = d.get("trades", [])
        eng.pnl_curve = d.get("pnl_curve", [])
        return eng
