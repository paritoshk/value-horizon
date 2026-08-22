"""Per-wallet behavioral features from a fills frame.

Expected fills columns: ts (datetime64), market_id, wallet, side ("BUY"/"SELL"),
size, price, notional, signed_notional.

MODEL_FEATURES deliberately excludes notional_sum: notional_sum is the target.
If the target leaks into its own feature block (own or neighbor side), the
ablation in the attribution step partly deletes a copy of the answer, and the
resulting "following" is inflated by leakage, not by structure.
"""

import pandas as pd

MODEL_FEATURES = ["n_trades", "n_markets", "mean_entry_price", "mean_trade_size", "category_hhi"]


def own_features(f: pd.DataFrame) -> pd.DataFrame:
    g = f.groupby("wallet")
    cat_share = (
        f.groupby(["wallet", "market_id"]).size()
        .groupby("wallet").apply(lambda s: ((s / s.sum()) ** 2).sum())
    )
    return pd.DataFrame({
        "n_trades": g.size(),
        "n_markets": g["market_id"].nunique(),
        "notional_sum": g["notional"].sum(),
        "mean_entry_price": g["price"].mean(),
        "mean_trade_size": g["notional"].mean(),
        "category_hhi": cat_share,
    }).fillna(0)


def neighbor_features(own: pd.DataFrame, edges: pd.DataFrame,
                      cols: list[str] = MODEL_FEATURES) -> pd.DataFrame:
    """Edge-weight-weighted mean of each in-neighbor's own block, per wallet."""
    if edges.empty:
        nbr = pd.DataFrame(0.0, index=own.index,
                           columns=[f"nbr_{c}" for c in cols] + ["nbr_degree"])
        return nbr
    e = edges.merge(own[cols], left_on="a", right_index=True)
    e[cols] = e[cols].mul(e["w"], axis=0)
    num = e.groupby("b")[cols].sum()
    den = e.groupby("b")["w"].sum()
    nbr = num.div(den, axis=0).add_prefix("nbr_")
    nbr["nbr_degree"] = e.groupby("b").size()
    return nbr.reindex(own.index).fillna(0)
