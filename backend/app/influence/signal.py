"""Cheap per-market signals computed every fast tick from the fills buffer.

All pure functions over the fills frame; the expensive graph/model refit only
changes `influential` (the wallet set) every REFIT_S.
"""

import numpy as np
import pandas as pd


def _recent(f: pd.DataFrame, now: pd.Timestamp, window: str) -> pd.DataFrame:
    return f[f["ts"] >= now - pd.Timedelta(window)]


def flow_z(f: pd.DataFrame, influential: set[str], market_id: str,
           now: pd.Timestamp, window: str = "1h") -> dict:
    """z-scored net signed notional of influential wallets, trailing window.
    z is against the per-hour history of the same quantity in the buffer."""
    m = f[f["market_id"] == market_id]
    if m.empty or not influential:
        return {"z": 0.0, "raw": 0.0, "n_influential_fills": 0}
    inf_fills = m[m["wallet"].isin(influential)]
    if inf_fills.empty:
        return {"z": 0.0, "raw": 0.0, "n_influential_fills": 0}
    hourly = inf_fills.set_index("ts")["signed_notional"].resample("1h").sum()
    in_window = inf_fills[inf_fills["ts"] >= now - pd.Timedelta(window)]
    cur = in_window["signed_notional"].sum()
    mu, sd = hourly.mean(), hourly.std()
    z = 0.0 if (not np.isfinite(sd) or sd == 0) else (cur - mu) / sd
    return {"z": round(float(z), 3), "raw": round(float(cur), 2),
            "n_influential_fills": int(len(in_window))}


def flow_imbalance(f: pd.DataFrame, market_id: str, now: pd.Timestamp,
                   window: str = "1h") -> dict:
    m = _recent(f[f["market_id"] == market_id], now, window)
    if m.empty:
        return {"imbalance": 0.0, "buy_usd": 0.0, "sell_usd": 0.0, "n": 0}
    buy = m.loc[m["signed_notional"] > 0, "notional"].sum()
    sell = m.loc[m["signed_notional"] < 0, "notional"].sum()
    tot = buy + sell
    return {"imbalance": round(float((buy - sell) / tot), 3) if tot else 0.0,
            "buy_usd": round(float(buy), 2), "sell_usd": round(float(sell), 2),
            "n": int(len(m))}


def whale_flow(f: pd.DataFrame, market_id: str, now: pd.Timestamp,
               window: str = "1h", q: float = 0.90) -> dict:
    m = f[f["market_id"] == market_id]
    if m.empty:
        return {"net_usd": 0.0, "n_whale": 0, "largest_usd": 0.0, "mean_usd": 0.0}
    thresh = m["notional"].quantile(q)
    w = _recent(m[m["notional"] >= thresh], now, window)
    return {"net_usd": round(float(w["signed_notional"].sum()), 2),
            "n_whale": int(len(w)),
            "largest_usd": round(float(w["notional"].max()), 2) if len(w) else 0.0,
            "mean_usd": round(float(m["notional"].mean()), 2)}


def momentum(prices: pd.Series, now: pd.Timestamp) -> dict:
    """prices: ts-indexed mid series."""
    if prices is None or len(prices) < 2:
        return {"chg_1h": 0.0, "chg_4h": 0.0, "last": None}
    last = float(prices.iloc[-1])
    out = {"last": round(last, 4)}
    for label, w in (("chg_1h", "1h"), ("chg_4h", "4h")):
        past = prices[prices.index <= now - pd.Timedelta(w)]
        out[label] = round(last - float(past.iloc[-1]), 4) if len(past) else 0.0
    return out
