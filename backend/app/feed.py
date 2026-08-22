"""Live Polymarket data: universe discovery, fills backfill, incremental polling.

All reads are public/unauthenticated. On failure: retry with backoff and
report degradation — never fabricate data.
"""

import json
import time

import numpy as np
import pandas as pd

from .connectors.polymarket import PolymarketClient

FILL_COLUMNS = ["ts", "market_id", "question", "wallet", "side", "size",
                "price", "outcome", "outcome_index", "tx"]


def _norm_trades(raw: list[dict]) -> pd.DataFrame:
    rows = []
    for t in raw:
        rows.append({
            "ts": pd.to_datetime(t["timestamp"], unit="s"),
            "market_id": t.get("conditionId", ""),
            "question": t.get("title", ""),
            "wallet": t.get("proxyWallet", ""),
            "side": t.get("side", ""),
            "size": float(t.get("size", 0)),
            "price": float(t.get("price", 0)),
            "outcome": t.get("outcome", ""),
            "outcome_index": t.get("outcomeIndex", 0),
            "tx": t.get("transactionHash", ""),
        })
    f = pd.DataFrame(rows, columns=FILL_COLUMNS)
    if f.empty:
        return f
    f["notional"] = (f["size"] * f["price"]).abs()
    f["signed_notional"] = f["size"] * f["price"] * np.where(f["side"] == "BUY", 1, -1)
    return f


class Feed:
    def __init__(self, client: PolymarketClient | None = None):
        self.client = client or PolymarketClient(timeout=15.0)
        self.failures = 0

    def _get(self, fn, *a, **kw):
        for attempt in range(3):
            try:
                r = fn(*a, **kw)
                if r["ok"]:
                    self.failures = 0
                    return r["data"]
            except Exception:
                pass
            time.sleep(1.5 * (attempt + 1))
        self.failures += 1
        return None

    def discover(self, n: int = 8) -> list[dict]:
        """Top-n active markets by 24h volume inside the tradeable prob band."""
        data = self._get(self.client.markets, closed="false", active="true",
                         order="volume24hr", ascending="false", limit=60)
        if not data:
            return []
        out = []
        for m in data:
            try:
                prices = json.loads(m.get("outcomePrices") or "[]")
                tokens = json.loads(m.get("clobTokenIds") or "[]")
                outcomes = json.loads(m.get("outcomes") or "[]")
                yes = float(prices[0]) if prices else None
            except (ValueError, IndexError, TypeError):
                continue
            if yes is None or not tokens or not (0.03 <= yes <= 0.97):
                continue
            out.append({
                "market_id": m.get("conditionId", ""),
                "question": m.get("question", ""),
                "slug": m.get("slug", ""),
                "yes_token": tokens[0],
                "no_token": tokens[1] if len(tokens) > 1 else None,
                "outcomes": outcomes or ["Yes", "No"],
                "volume24hr": float(m.get("volume24hr") or 0),
                "yes_price": yes,
            })
            if len(out) >= n:
                break
        return out

    def backfill_fills(self, market_ids: list[str], per_market: int = 500) -> pd.DataFrame:
        frames = []
        for mid in market_ids:
            collected, offset = [], 0
            while len(collected) < per_market:
                batch = self._get(self.client.trades, market=mid,
                                  limit=min(500, per_market - len(collected)),
                                  offset=offset)
                if not batch:
                    break
                collected.extend(batch)
                if len(batch) < 500:
                    break
                offset += len(batch)
            if collected:
                frames.append(_norm_trades(collected))
        if not frames:
            return pd.DataFrame(columns=FILL_COLUMNS + ["notional", "signed_notional"])
        f = pd.concat(frames, ignore_index=True)
        return f.drop_duplicates(subset=["tx", "wallet", "size", "price"]).sort_values("ts")

    def poll_new_fills(self, market_ids: list[str], since_ts: pd.Timestamp) -> pd.DataFrame:
        """Latest fills across the universe (data-api returns newest first)."""
        frames = []
        for mid in market_ids:
            batch = self._get(self.client.trades, market=mid, limit=100)
            if batch:
                frames.append(_norm_trades(batch))
        if not frames:
            return pd.DataFrame(columns=FILL_COLUMNS + ["notional", "signed_notional"])
        f = pd.concat(frames, ignore_index=True)
        return f[f["ts"] > since_ts].sort_values("ts")

    def book_top(self, token_id: str) -> dict:
        data = self._get(self.client.book, token_id)
        bid = ask = None
        if data:
            bids = data.get("bids") or []
            asks = data.get("asks") or []
            # CLOB book arrays are best-price-last
            if bids:
                bid = float(max(bids, key=lambda x: float(x["price"]))["price"])
            if asks:
                ask = float(min(asks, key=lambda x: float(x["price"]))["price"])
        return {"bid": bid, "ask": ask}

    def price_history(self, token_id: str) -> pd.Series | None:
        data = self._get(self.client.call, "clob", "GET", "/prices-history",
                         params={"market": token_id, "interval": "1w", "fidelity": 5})
        if not data or "history" not in data:
            return None
        h = pd.DataFrame(data["history"])
        if h.empty:
            return None
        h["ts"] = pd.to_datetime(h["t"], unit="s")
        return h.set_index("ts")["p"].sort_index()
