"""Walk-forward check: did the signal predict anything on this window?

For each market-hour in the backfilled history:
  flow_z(t)  = z(net signed notional of influential wallets over (t-1h, t])
  imb(t)     = z(net signed notional of ALL wallets over (t-1h, t])   [baseline]
  fwd(t)     = p(t+1h) - p(t)                                          [target]

Pooled Spearman rank IC of each signal vs fwd, plus the baseline comparison —
if influence-flow IC does not beat raw imbalance, the graph adds nothing and
sizing stays at probe level. Deterministic: this number, not an LLM, scales
position size.
"""

import numpy as np
import pandas as pd
from scipy.stats import spearmanr


def _hourly_signal(f: pd.DataFrame, wallets: set[str] | None) -> pd.Series:
    sel = f if wallets is None else f[f["wallet"].isin(wallets)]
    if sel.empty:
        return pd.Series(dtype=float)
    s = sel.set_index("ts")["signed_notional"].resample("1h").sum()
    sd = s.std()
    return (s - s.mean()) / sd if sd and np.isfinite(sd) else s * 0.0


def signal_ic(fills: pd.DataFrame, prices: dict[str, pd.Series],
              token_by_market: dict[str, str], influential: set[str]) -> dict:
    rows = []
    for mid, tok in token_by_market.items():
        p = prices.get(tok)
        f = fills[fills["market_id"] == mid]
        if p is None or len(p) < 24 or f.empty:
            continue
        ph = p.resample("1h").last().dropna()
        fwd = ph.shift(-1) - ph
        flow = _hourly_signal(f, influential).reindex(ph.index)
        imb = _hourly_signal(f, None).reindex(ph.index)
        d = pd.DataFrame({"flow": flow, "imb": imb, "fwd": fwd}).dropna()
        d["market_id"] = mid
        rows.append(d)
    if not rows:
        return {"n_samples": 0, "ic_flow": None, "ic_imbalance": None, "flow_beats_baseline": False}
    pool = pd.concat(rows)
    out = {"n_samples": int(len(pool))}
    for name, col in (("ic_flow", "flow"), ("ic_imbalance", "imb")):
        if pool[col].nunique() > 2 and len(pool) >= 20:
            ic, pval = spearmanr(pool[col], pool["fwd"])
            out[name] = {"ic": round(float(ic), 4), "p_value": round(float(pval), 4)}
        else:
            out[name] = None
    fi = out["ic_flow"]["ic"] if out["ic_flow"] else 0.0
    bi = out["ic_imbalance"]["ic"] if out["ic_imbalance"] else 0.0
    out["flow_beats_baseline"] = bool(fi > 0 and fi > bi)
    return out


def max_ticket_usd(backtest: dict, full_size: float | None = None,
                   probe: float | None = None) -> float:
    """Deterministic sizing rule: full size only if the signal had positive
    walk-forward IC AND beat the raw-imbalance baseline on this window;
    otherwise probe size. Arithmetic, not judgment."""
    from .. import config
    full_size = full_size if full_size is not None else config.TICKET_FULL_USD
    probe = probe if probe is not None else config.TICKET_PROBE_USD
    ic = (backtest or {}).get("ic_flow") or {}
    if backtest and backtest.get("flow_beats_baseline") and ic.get("ic", 0) > 0:
        return full_size
    return probe
