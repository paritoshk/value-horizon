import time

from fastapi import APIRouter, Request

router = APIRouter()


def _st(request: Request):
    return request.app.state.world, request.app.state.journal


@router.get("/api/health")
def health(request: Request):
    st, _ = _st(request)
    return {"ok": True, "mode": st.mode, "cycle": st.cycle}


@router.get("/api/state")
def state(request: Request):
    st, journal = _st(request)
    now = time.time()
    counts = journal.counts()
    portfolio = getattr(st, "portfolio", None) or {
        "cash": round(st.paper.cash, 2), "equity": round(st.paper.cash, 2),
        "realized": round(st.paper.realized, 2), "unrealized": 0.0}
    markets = []
    for m in st.universe:
        s = st.signals.get(m["market_id"], {})
        tok = m["yes_token"]
        pos = st.paper.positions.get(tok)
        bid, ask = s.get("bid"), s.get("ask")
        markets.append({
            "market_id": m["market_id"], "question": m["question"],
            "volume24hr": m["volume24hr"],
            "mid": round((bid + ask) / 2, 4) if (bid is not None and ask is not None)
                   else m.get("yes_price"),
            "bid": bid, "ask": ask, "spread": s.get("spread"),
            "flow_z": s.get("flow", {}).get("z", 0.0),
            "imbalance": s.get("imb_1h", {}).get("imbalance", 0.0),
            "whale_net_usd": s.get("whale", {}).get("net_usd", 0.0),
            "detector": s.get("detector", "warming"),
            "position": {"qty": round(pos.qty, 2), "avg_cost": pos.avg_cost,
                         "outcome": pos.outcome} if pos else None,
        })
    return {
        "ts": now, "mode": st.mode, "cycle": st.cycle,
        "sentinel": {
            "uptime_s": round(now - st.boot_ts, 1),
            "rounds": counts["rounds"], "acted": counts["acted"], "held": counts["held"],
            "next_analyst_in_s": max(0, round(st.next_analyst_ts - now)),
            "next_refit_in_s": max(0, round(st.next_refit_ts - now)),
            "last_checkpoint_ts": st.last_checkpoint_ts,
            "restored_from_checkpoint": st.restored_from_checkpoint,
            "downtime_s": round(st.downtime_s, 1),
        },
        "markets": markets,
        "agents": st.last_round,
        "portfolio": portfolio,
        "pnl": st.paper.pnl_curve[-500:],
        "trades": st.paper.trades[-20:],
        "timeline": journal.tail[-50:],
        "model": st.model,
    }


@router.get("/api/wallets")
def wallets(request: Request):
    st, _ = _st(request)
    return {"wallets": st.wallet_cloud}


@router.get("/api/edges")
def edges(request: Request):
    st, _ = _st(request)
    return {"edges": st.edge_list}


@router.get("/api/timeline")
def timeline(request: Request, since_ts: float = 0.0, limit: int = 200):
    _, journal = _st(request)
    events = [e for e in journal.tail if e["ts"] > since_ts]
    return {"events": events[-limit:]}


@router.get("/api/debug/poke")
def poke(request: Request):
    st, _ = _st(request)
    st.poke = True
    return {"ok": True, "note": "analyst round will fire on next tick"}
