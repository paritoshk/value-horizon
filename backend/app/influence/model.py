"""Ablation attribution: how much of each wallet's activity is explained by
its lead-lag neighbors, and which wallets that credit flows back to.

  1. rf = RandomForest(own_features + neighbor_features) -> activity
  2. zero the neighbor block, re-predict
  3. following[b] = actual - prediction_without_neighbors
  4. split following[b] across in-neighbors a by edge-weight share
  5. influence[a] = sum of credit received
  6. network_share = clip(following, 0).sum() / activity.sum()

OOB R^2 is reported alongside — an attribution number from a model with no
out-of-sample skill is decoration, and the UI shows both so nobody has to
take that on faith.
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

from .features import MODEL_FEATURES, own_features, neighbor_features


def fit_influence(f: pd.DataFrame, edges: pd.DataFrame, y_col: str = "notional_sum",
                  n_estimators: int = 200, seed: int = 0):
    o = own_features(f)
    nbr = neighbor_features(o, edges)
    X = o[MODEL_FEATURES].join(nbr)
    y = o[y_col]
    rf = RandomForestRegressor(n_estimators=n_estimators, min_samples_leaf=3,
                               oob_score=True, random_state=seed, n_jobs=-1)
    rf.fit(X, y)
    X0 = X.copy()
    X0[nbr.columns] = 0
    following = pd.Series(y - rf.predict(X0), index=X.index)
    if edges.empty:
        influence = pd.Series(0.0, index=X.index)
        return X, y, rf, following, influence
    e2 = edges.merge(following.rename("following"), left_on="b", right_index=True)
    e2["w_share"] = e2["w"] / e2.groupby("b")["w"].transform("sum")
    e2["pair_inf"] = e2["following"] * e2["w_share"]
    influence = e2.groupby("a")["pair_inf"].sum()
    return X, y, rf, following, influence.reindex(X.index).fillna(0)


def bootstrap_influence(f: pd.DataFrame, edges: pd.DataFrame, B: int = 15,
                        y_col: str = "notional_sum") -> pd.DataFrame:
    """Day-block bootstrap: a wallet counts as influential only if its
    5th-percentile score stays positive across resampled refits."""
    days = f["ts"].dt.floor("D").unique()
    rng = np.random.default_rng(1)
    draws = []
    for b in range(B):
        sample_days = rng.choice(days, size=len(days), replace=True)
        fb = pd.concat([f[f["ts"].dt.floor("D") == d] for d in sample_days])
        try:
            _, _, _, _, inf_b = fit_influence(fb, edges, y_col=y_col,
                                              n_estimators=80, seed=b)
            draws.append(inf_b)
        except Exception:
            continue
    if not draws:
        return pd.DataFrame()
    return pd.concat(draws, axis=1)


def stability_table(boot: pd.DataFrame) -> pd.DataFrame:
    stab = pd.DataFrame({
        "inf_mean": boot.mean(axis=1),
        "inf_p05": boot.quantile(0.05, axis=1),
        "inf_p95": boot.quantile(0.95, axis=1),
    }).sort_values("inf_mean", ascending=False)
    stab["influential"] = stab["inf_p05"] > 0
    return stab


def importances(rf, X: pd.DataFrame) -> list[dict]:
    return sorted(
        ({"feature": c, "importance": round(float(v), 4)}
         for c, v in zip(X.columns, rf.feature_importances_)),
        key=lambda d: -d["importance"],
    )


def interaction_heatmap(rf, X: pd.DataFrame, n_bins: int = 12) -> dict:
    """Partial-dependence grid over the top-2 features — the light-weight
    dependence map (how the fitted response curves when two features move
    together, everything else held at the connected-wallet median)."""
    imp = importances(rf, X)
    fx, fy = imp[0]["feature"], imp[1]["feature"]
    connected = X[X["nbr_degree"] > 0] if (X["nbr_degree"] > 0).any() else X
    gx = np.linspace(X[fx].quantile(0.02), X[fx].quantile(0.98), n_bins)
    gy = np.linspace(X[fy].quantile(0.02), X[fy].quantile(0.98), n_bins)
    GX, GY = np.meshgrid(gx, gy)
    grid = pd.DataFrame({c: connected[c].median() for c in X.columns},
                        index=range(GX.size))
    grid[fx] = GX.ravel()
    grid[fy] = GY.ravel()
    Z = rf.predict(grid[X.columns]).reshape(GX.shape)
    return {
        "fx": fx, "fy": fy,
        "x_bins": [round(float(v), 4) for v in gx],
        "y_bins": [round(float(v), 4) for v in gy],
        "z": [[round(float(v), 2) for v in row] for row in Z],
    }
