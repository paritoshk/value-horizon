"""The sentinel loop: one asyncio task, three cadences.

  fast tick  (POLL_FAST_S)  poll fills/books -> cheap signals -> detector ->
                            mark PnL -> checkpoint
  analyst    (ANALYST_S,    fan out 5 analysts -> deterministic supervisor ->
              or trigger)   guardrail gate -> paper fill at live ask/bid
  refit      (REFIT_S)      lead-lag graph -> permutation null -> ablation
                            attribution -> bootstrap -> heatmap  (in a thread)

Every decision — including every HOLD — is journaled. That journal is the
long-horizon record the UI renders.
"""

import asyncio
import time

import numpy as np
import pandas as pd

from . import config
from .agents.analysts import ANALYSTS, build_packet, run_analyst
from .agents import supervisor
from .engine import guardrails
from .engine.detector import PriceTick, StreamConfig, DetectorState, update as det_update
from .engine.journal import Journal
from .engine.paper import fill_price
from .feed import Feed
from .influence.graph import lead_lag_edges, shuffled_null, keep_real_edges
from .influence.model import (fit_influence, bootstrap_influence, stability_table,
                              importances, interaction_heatmap)
from .influence.backtest import signal_ic, max_ticket_usd
from .influence import signal as sig
from .state import AppState

DET_CFG = StreamConfig(warmup_n=12, cooldown_s=300)


def refit(st: AppState) -> dict:
    """Full pipeline stages 1-4 + artifacts. Runs in a worker thread."""
    fills = st.fills
    t0 = time.time()
    edges_raw = lead_lag_edges(fills, dt="1h", min_events=3)
    null = shuffled_null(fills, n_draws=config.NULL_DRAWS, dt="1h")
    edges = keep_real_edges(edges_raw, null)
    real = edges[edges.keep]
    X, y, rf, following, influence = fit_influence(fills, real)
    boot = bootstrap_influence(fills, real, B=config.BOOTSTRAP_B)
    stab = stability_table(boot) if not boot.empty else pd.DataFrame()
    influential = set(stab[stab["influential"]].index) if not stab.empty else set()
    share = float(following.clip(lower=0).sum() / y.sum()) if y.sum() else 0.0

    # wallet cloud: 2-D PCA of standardized model features
    from sklearn.decomposition import PCA
    feats = X[[c for c in X.columns if not c.startswith("nbr_")]]
    Z = (feats - feats.mean()) / feats.std().replace(0, 1)
    xy = PCA(n_components=2, random_state=0).fit_transform(Z.fillna(0).values)
    inf_max = float(influence.abs().max()) or 1.0
    cloud = [{
        "id": w[:10], "x": round(float(xy[i, 0]), 3), "y": round(float(xy[i, 1]), 3),
        "influence": round(float(influence.iloc[i]) / inf_max, 4),
        "influential": w in influential,
        "notional": round(float(y.iloc[i]), 2),
    } for i, w in enumerate(X.index)]

    top_edges = real.nlargest(200, "w")
    edge_list = [{"src": r.a[:10], "dst": r.b[:10], "w": round(float(r.w), 3),
                  "n": int(r.n)} for r in top_edges.itertuples()]

    token_by_market = {m["market_id"]: m["yes_token"] for m in st.universe}
    backtest = signal_ic(fills, st.prices, token_by_market, influential)

    return {
        "influential": influential,
        "wallet_cloud": cloud,
        "edge_list": edge_list,
        "model": {
            "oob_r2": round(float(rf.oob_score_), 4),
            "network_share": round(share, 4),
            "importances": importances(rf, X),
            "heatmap": interaction_heatmap(rf, X),
            "backtest": backtest,
            "max_ticket_usd": max_ticket_usd(backtest),
            "stages": {
                "n_fills": int(len(fills)),
                "n_wallets": int(fills["wallet"].nunique()),
                "candidate_edges": int(len(edges)),
                "surviving_edges": int(len(real)),
                "survival_rate": round(float(len(real) / max(len(edges), 1)), 4),
                "null_draws": config.NULL_DRAWS,
                "n_influential": int(len(influential)),
                "bootstrap_B": config.BOOTSTRAP_B,
                "refit_s": round(time.time() - t0, 1),
            },
        },
    }


def _apply_refit(st: AppState, out: dict, journal: Journal):
    prev = len(st.influential)
    st.influential = out["influential"]
    st.wallet_cloud = out["wallet_cloud"]
    st.edge_list = out["edge_list"]
    st.model = out["model"]
    st.fills_at_last_refit = len(st.fills)
    journal.append("graph_refit", **out["model"]["stages"],
                   influential_delta=len(st.influential) - prev)


def update_cheap_signals(st: AppState):
    now = pd.Timestamp.utcnow().tz_localize(None)
    oob = st.model.get("oob_r2")
    for m in st.universe:
        mid_id, tok = m["market_id"], m["yes_token"]
        book = st.books.get(tok, {})
        bid, ask = book.get("bid"), book.get("ask")
        prices = st.prices.get(tok)
        det_state = st.detectors.get(tok)
        st.signals[mid_id] = {
            "flow": sig.flow_z(st.fills, st.influential, mid_id, now),
            "imb_15m": sig.flow_imbalance(st.fills, mid_id, now, "15min"),
            "imb_1h": sig.flow_imbalance(st.fills, mid_id, now, "1h"),
            "whale": sig.whale_flow(st.fills, mid_id, now),
            "momentum": sig.momentum(prices, now),
            "bid": bid, "ask": ask,
            "spread": round(ask - bid, 4) if (ask is not None and bid is not None) else None,
            "detector": st.detector_status.get(tok, "warming"),
            "cusum_stat": round(max(det_state.s_pos, det_state.s_neg), 2) if det_state else 0.0,
            "n_influential": len(st.influential),
            "oob_r2": oob,
        }


async def analyst_round(st: AppState, journal: Journal, trig: dict | None = None):
    """Pick the market with the strongest combined evidence, fan out analysts."""
    if not st.universe or not st.signals:
        return
    # focus market: largest |flow z| + |imbalance|, but rotate so one hot market
    # doesn't monopolize every round — skip the last few we already looked at,
    # unless a trigger points somewhere specific.
    def heat(m):
        s = st.signals.get(m["market_id"], {})
        return abs(s.get("flow", {}).get("z", 0)) + abs(s.get("imb_1h", {}).get("imbalance", 0))
    if trig and trig.get("market_id"):
        market = next((m for m in st.universe if m["market_id"] == trig["market_id"]),
                      max(st.universe, key=heat))
    else:
        recent = set(st.recent_focus)
        fresh = [m for m in st.universe if m["market_id"] not in recent]
        market = max(fresh or st.universe, key=heat)
    st.recent_focus = (st.recent_focus + [market["market_id"]])[-4:]
    mid_id, tok = market["market_id"], market["yes_token"]
    s = st.signals.get(mid_id, {})
    mkt_view = {"question": market["question"], "mid": s.get("bid") and s.get("ask")
                and round((s["bid"] + s["ask"]) / 2, 4) or market.get("yes_price")}

    votes = await asyncio.gather(*[
        run_analyst(name, build_packet(name, mkt_view, s)) for name in ANALYSTS
    ])
    decision = supervisor.combine(list(votes))

    ticket = None
    if decision["direction"] != "flat" and abs(decision["score"]) >= guardrails.MIN_SCORE:
        side = "BUY"  # paper book is long-only; long_no would buy the NO token (v2)
        if decision["direction"] == "long_yes":
            ticket = {"market_id": mid_id, "question": market["question"],
                      "outcome": market["outcomes"][0], "token_id": tok,
                      "side": side, "notional_usd": min(guardrails.MAX_TICKET_USD,
                                                        round(25 * abs(decision["score"]) * 2, 2))}
    decision["ticket"] = ticket
    gated = guardrails.gate(decision, {m["market_id"] for m in st.universe},
                            st.paper, journal.journaled_buy_notional(),
                            max_ticket=st.model.get("max_ticket_usd",
                                                    guardrails.MAX_TICKET_USD))
    decision["action"] = gated["action"]
    synthesis = await supervisor.synthesize(decision, mkt_view)

    st.last_round = {
        "round_ts": time.time(), "market_id": mid_id, "question": market["question"],
        "analysts": list(votes), "supervisor": {
            "score": decision["score"], "direction": decision["direction"],
            "action": gated["action"], "reasons": gated["reasons"],
            "synthesis": synthesis},
    }
    journal.append("analyst_round", market_id=mid_id, question=market["question"],
                   score=decision["score"],
                   votes={v["name"]: [v["stance"], v["confidence"]] for v in votes})

    if gated["action"] == "TRADE" and gated["ticket"]:
        book = st.books.get(tok, {})
        event = st.paper.execute(gated["ticket"], book)
        if event:
            journal.append(event.pop("type"), **event, score=decision["score"],
                           synthesis=synthesis)
        else:
            journal.append("hold", market_id=mid_id,
                           reasons=["book unavailable or unfillable"], score=decision["score"])
    else:
        journal.append("hold", market_id=mid_id, reasons=gated["reasons"],
                       score=decision["score"], synthesis=synthesis)


async def maybe_exit_positions(st: AppState, journal: Journal):
    """Simple exit: close any position with >=15% gain or <=-20% loss at bid."""
    for tok, pos in list(st.paper.positions.items()):
        bid = (st.books.get(tok) or {}).get("bid")
        if bid is None or pos.avg_cost <= 0:
            continue
        ret = (bid - pos.avg_cost) / pos.avg_cost
        if ret >= 0.15 or ret <= -0.20:
            event = st.paper.execute(
                {"market_id": pos.market_id, "question": pos.question,
                 "outcome": pos.outcome, "token_id": tok, "side": "SELL",
                 "notional_usd": pos.qty * bid}, {"bid": bid, "ask": None})
            if event:
                journal.append(event.pop("type"), **event,
                               reason=f"exit rule ret={ret:+.1%}")


async def run_sentinel(st: AppState, journal: Journal):
    restored = st.restore()
    if restored:
        journal.append("checkpoint_restored", downtime_s=round(st.downtime_s, 1),
                       open_positions=len(st.paper.positions), cycle=st.cycle)
    journal.append("boot", mode=st.mode)

    feed = Feed()
    # --- live boot backfill ---
    for attempt in range(5):
        st.universe = await asyncio.to_thread(feed.discover, config.N_MARKETS)
        if st.universe:
            break
        journal.append("feed_degraded", stage="discover", attempt=attempt)
        await asyncio.sleep(5)
    ids = [m["market_id"] for m in st.universe]
    st.fills = await asyncio.to_thread(feed.backfill_fills, ids,
                                       config.BACKFILL_FILLS_PER_MARKET)
    journal.append("backfill", n_fills=int(len(st.fills)),
                   n_wallets=int(st.fills["wallet"].nunique()) if len(st.fills) else 0,
                   n_markets=len(st.universe))
    for m in st.universe:
        tok = m["yes_token"]
        st.prices[tok] = await asyncio.to_thread(feed.price_history, tok)
        st.detectors.setdefault(tok, DetectorState())
        # warm the detector on history so it can fire today, not tomorrow
        series = st.prices.get(tok)
        if series is not None:
            for ts, p in series.tail(200).items():
                det_update(st.detectors[tok], PriceTick(tok, ts.timestamp(), float(p)), DET_CFG)
            st.detector_status[tok] = "quiet"

    # first refit immediately so the UI has a graph within minutes of boot
    out = await asyncio.to_thread(refit, st)
    _apply_refit(st, out, journal)
    now = time.time()
    st.next_analyst_ts = now + 15   # first round soon after boot
    st.next_refit_ts = now + config.REFIT_S

    last_beat = 0.0
    while True:
        tick_start = time.time()
        st.cycle += 1
        try:
            # --- poll live data ---
            new = await asyncio.to_thread(
                feed.poll_new_fills, ids,
                st.fills["ts"].max() if len(st.fills) else pd.Timestamp(0))
            if len(new):
                st.fills = pd.concat([st.fills, new], ignore_index=True)
                st.fills = st.fills.drop_duplicates(
                    subset=["tx", "wallet", "size", "price"]).sort_values("ts")
            for m in st.universe:
                tok = m["yes_token"]
                st.books[tok] = await asyncio.to_thread(feed.book_top, tok)
                b = st.books[tok]
                if b["bid"] is not None and b["ask"] is not None:
                    mid = (b["bid"] + b["ask"]) / 2
                    trig = det_update(st.detectors[tok],
                                      PriceTick(tok, time.time(), mid), DET_CFG)
                    ser = st.prices.get(tok)
                    point = pd.Series([mid], index=[pd.Timestamp.utcnow().tz_localize(None)])
                    st.prices[tok] = pd.concat([ser, point]) if ser is not None else point
                    if trig:
                        st.detector_status[tok] = trig.kind
                        st.trigger = {"market_id": m["market_id"], "kind": trig.kind,
                                      "stat": trig.stat, "ts": trig.ts}
                        journal.append("detector_trigger", market_id=m["market_id"],
                                       question=m["question"], kind=trig.kind, stat=trig.stat)
                    elif st.detector_status.get(tok) not in ("quiet",):
                        st.detector_status[tok] = "quiet"
            if feed.failures >= 5:
                journal.append("feed_degraded", consecutive_failures=feed.failures)

            update_cheap_signals(st)
            st.portfolio = st.paper.mark(st.books)
            await maybe_exit_positions(st, journal)

            now = time.time()
            if now - last_beat > 60:
                journal.append("heartbeat", cycle=st.cycle,
                               equity=st.paper.pnl_curve[-1]["equity"] if st.paper.pnl_curve else None)
                last_beat = now

            if now >= st.next_analyst_ts or st.trigger or st.poke:
                st.poke = False
                trig, st.trigger = st.trigger, None
                await analyst_round(st, journal, trig)
                st.next_analyst_ts = time.time() + config.ANALYST_S

            if now >= st.next_refit_ts and \
                    len(st.fills) - st.fills_at_last_refit >= config.REFIT_MIN_NEW_FILLS:
                out = await asyncio.to_thread(refit, st)
                _apply_refit(st, out, journal)
                st.next_refit_ts = time.time() + config.REFIT_S
            elif now >= st.next_refit_ts:
                st.next_refit_ts = time.time() + config.REFIT_S  # not enough new fills; wait

            st.save_checkpoint()
        except Exception as exc:  # keep the sentinel alive; journal the wound
            journal.append("error", where="sentinel_tick", error=repr(exc)[:300])

        elapsed = time.time() - tick_start
        await asyncio.sleep(max(1.0, config.POLL_FAST_S - elapsed))
