import numpy as np
import pandas as pd
import pytest

from app.engine.detector import DetectorState, PriceTick, StreamConfig, update
from app.engine.guardrails import gate
from app.engine.paper import PaperEngine, fill_price
from app.influence.graph import lead_lag_edges, shuffled_null, keep_real_edges
from app.influence.model import fit_influence
from app.agents.llm import invented_numbers, parse_json_block


# ---------- fill model ----------

def test_fill_price_pessimistic():
    book = {"bid": 0.60, "ask": 0.63}
    assert fill_price(book, "BUY") == 0.63     # buy at ask, never mid
    assert fill_price(book, "SELL") == 0.60    # sell at bid
    assert fill_price({"bid": None, "ask": None}, "BUY") is None


def test_entry_rejected_in_pinned_or_degenerate_book():
    eng = PaperEngine(cash=100.0)
    t = {"market_id": "m", "question": "q", "outcome": "Yes", "token_id": "t",
         "side": "BUY", "notional_usd": 17.6}
    assert eng.execute(t, {"bid": 0.999, "ask": 0.001}) is None   # inverted artifact
    assert eng.execute(t, {"bid": None, "ask": 0.5}) is None       # one-sided book
    assert eng.execute(t, {"bid": 0.01, "ask": 0.02}) is None      # pinned low
    assert eng.execute(t, {"bid": 0.40, "ask": 0.50}) is None      # 10c spread
    assert eng.execute(t, {"bid": 0.60, "ask": 0.63}) is not None  # healthy book


def test_paper_round_trip_loses_the_spread():
    eng = PaperEngine(cash=100.0)
    book = {"bid": 0.60, "ask": 0.63}
    open_ev = eng.execute({"market_id": "m", "question": "q", "outcome": "Yes",
                           "token_id": "t", "side": "BUY", "notional_usd": 63.0}, book)
    assert open_ev and open_ev["fill_px"] == 0.63
    close_ev = eng.execute({"market_id": "m", "question": "q", "outcome": "Yes",
                            "token_id": "t", "side": "SELL", "notional_usd": 60.0}, book)
    assert close_ev and close_ev["fill_px"] == 0.60
    assert close_ev["pnl"] < 0  # an instant round trip must lose the spread


# ---------- guardrails ----------

def _decision(score, notional=25.0, market="m1"):
    return {"score": score, "ticket": {"market_id": market, "question": "q",
            "outcome": "Yes", "token_id": "t", "side": "BUY", "notional_usd": notional}}


def test_gate_holds_below_threshold():
    out = gate({"score": 0.3, "ticket": None}, {"m1"}, PaperEngine(), 0.0)
    assert out["action"] == "HOLD"


def test_gate_resizes_oversize_and_blocks_unknown_market():
    from app import config
    eng = PaperEngine()
    out = gate(_decision(0.9, notional=5000), {"m1"}, eng, 0.0)
    assert out["action"] == "TRADE"
    assert out["ticket"]["notional_usd"] == config.TICKET_FULL_USD
    assert gate(_decision(0.9, market="mX"), {"m1"}, eng, 0.0)["action"] == "HOLD"
    assert gate(_decision(0.9), {"m1"}, eng, 0.0)["action"] == "TRADE"


def test_gate_ic_probe_sizing():
    out = gate(_decision(0.9, notional=40.0), {"m1"}, PaperEngine(), 0.0, max_ticket=10.0)
    assert out["action"] == "TRADE" and out["ticket"]["notional_usd"] == 10.0
    assert any("IC rule" in r for r in out["reasons"])


def test_gate_lifetime_cap():
    from app.engine.guardrails import LIFETIME_NOTIONAL_CAP
    near_cap = LIFETIME_NOTIONAL_CAP - 10.0
    assert gate(_decision(0.9), {"m1"}, PaperEngine(), near_cap)["action"] == "HOLD"


# ---------- detector ----------

def test_detector_checkpoint_roundtrip_identical_triggers():
    cfg = StreamConfig(warmup_n=10, cooldown_s=0, realert_delta=0.0)
    rng = np.random.default_rng(0)
    probs = list(0.5 + np.cumsum(rng.normal(0, 0.002, 100)))
    probs += [probs[-1] + 0.1] * 10  # step change

    def run(states_from=None):
        s = states_from or DetectorState()
        fired = []
        for i, p in enumerate(probs):
            t = update(s, PriceTick("m", float(i), float(p)), cfg)
            if t:
                fired.append((i, t.kind))
            if states_from is None and i == 50:
                s = DetectorState.from_dict(s.to_dict())  # round-trip mid-run
        return fired

    assert run() == run(DetectorState())
    assert len(run()) >= 1  # the step fires


# ---------- influence pipeline on a planted follower ----------

def test_planted_follower_recovered():
    rng = np.random.default_rng(7)
    base = pd.Timestamp("2026-08-20")
    rows = []
    # leader trades, follower copies 10 min later, 30 times; plus noise wallets
    for k in range(30):
        t = base + pd.Timedelta(hours=k * 2)
        rows.append(("leader", t))
        rows.append(("follower", t + pd.Timedelta("10min")))
    for k in range(200):
        t = base + pd.Timedelta(seconds=int(rng.integers(0, 60 * 3600)))
        rows.append((f"w{rng.integers(0, 40)}", t))
    f = pd.DataFrame({
        "wallet": [r[0] for r in rows],
        "ts": [r[1] for r in rows],
        "market_id": "m1", "side": "BUY",
        "size": 10.0, "price": 0.5,
    })
    f["notional"] = f["size"] * f["price"]
    f["signed_notional"] = f["notional"]
    edges_raw = lead_lag_edges(f, dt="1h", min_events=3)
    null = shuffled_null(f, n_draws=30, dt="1h")
    real = keep_real_edges(edges_raw, null)
    kept = real[real.keep]
    planted = kept[(kept.a == "leader") & (kept.b == "follower")]
    assert len(planted) == 1, "planted lead-lag edge must survive the null"
    X, y, rf, following, influence = fit_influence(f, kept)
    assert influence.loc["leader"] != 0


# ---------- llm guards ----------

def test_invented_numbers():
    packet = {"z": 1.8, "buy_usd": 12500.0}
    assert invented_numbers("z-score of 1.8 with $12,500 bought", packet) == []
    assert invented_numbers("volume was 99999", packet) == ["99999"]


def test_parse_json_block_tolerates_fences():
    text = 'thinking...\n```json\n{"stance": "flat", "confidence": 0.2, "rationale": "x"}\n```'
    assert parse_json_block(text)["stance"] == "flat"
