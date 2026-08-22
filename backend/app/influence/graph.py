"""Lead-lag graph over wallet fills, with a shuffled-time permutation null.

Edge A -> B: wallet A trades a (market, side) and wallet B trades the same
(market, side) within dt afterwards. Weight w = log1p(n_events).

The null permutes each fill's timestamp within (day, market, side): every
marginal (who traded what, how much, which day) is preserved; only the fine
ordering is destroyed. An edge is kept only if its observed count beats the
99th percentile of its null distribution — this is what separates "A leads B"
from "everyone reacted to the same news at the same time".
"""

import numpy as np
import pandas as pd


def lead_lag_edges(f: pd.DataFrame, dt: str = "1h", min_events: int = 3) -> pd.DataFrame:
    out = []
    for (m, s), g in f.sort_values("ts").groupby(["market_id", "side"]):
        t = g["ts"].values.astype("datetime64[ns]").astype(np.int64)
        w = g["wallet"].values
        hi = np.searchsorted(t, t + pd.Timedelta(dt).value, side="right")
        for i in range(len(t)):
            for j in range(i + 1, hi[i]):
                if w[i] != w[j]:
                    out.append((w[i], w[j]))
    if not out:
        return pd.DataFrame(columns=["a", "b", "n", "w"])
    e = (pd.DataFrame(out, columns=["a", "b"])
         .groupby(["a", "b"]).size().rename("n").reset_index())
    e = e[e.n >= min_events]
    e["w"] = np.log1p(e.n)
    return e


def shuffled_null(f: pd.DataFrame, n_draws: int = 60, **kw) -> pd.Series:
    rng = np.random.default_rng(0)
    f2 = f.copy()
    f2["day"] = f2["ts"].dt.floor("D")
    counts = []
    for _ in range(n_draws):
        g = f2.copy()
        g["ts"] = g.groupby(["day", "market_id", "side"])["ts"] \
                   .transform(lambda x: rng.permutation(x.values))
        e = lead_lag_edges(g, min_events=1, **kw)
        counts.append(e.set_index(["a", "b"])["n"])
    null = pd.concat(counts, axis=1).fillna(0)
    return null.quantile(0.99, axis=1).rename("null_p99")


def keep_real_edges(edges_raw: pd.DataFrame, null_p99: pd.Series) -> pd.DataFrame:
    edges = (edges_raw.set_index(["a", "b"]).join(null_p99)
             .fillna({"null_p99": 0}).reset_index())
    edges["keep"] = edges.n > edges.null_p99
    return edges
