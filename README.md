# Lead-Lag Sentinel

A long-horizon multi-agent system that watches live Polymarket markets, learns
which wallets *lead* and which *follow*, and paper-trades against the live
order book — visualized as an isometric simulation.

Built in one day at a long-horizon-agents build day. All data is live and
public; no keys are required to run the market pipeline.

## The idea

Most "smart money" signals are indistinguishable from *everyone reacting to the
same news at the same time*. This project separates the two with a permutation
test, then trades only the flow of wallets whose lead-lag structure survives it.

### The pipeline (all live, all on screen)

1. **Lead-lag graph** — edge A→B if wallet A trades a (market, side) and B
   trades the same within Δt = 1h. Weight `w = log(1+n)`.
2. **Permutation null** — shuffle each wallet's timestamps within
   (day, market, side); keep an edge only if its count beats the null's 99th
   percentile. This is what kills the shared-news confound.
3. **Ablation attribution** — a random forest predicts each wallet's activity
   from its own features plus edge-weighted neighbor features; zero the
   neighbor block, re-predict, and the gap ("following") is credited back
   across in-neighbors by edge weight. Out-of-bag R² is reported on screen —
   an attribution from a model with no out-of-sample skill is decoration.
4. **Stability bootstrap** — day-block bootstrap; a wallet counts as
   *influential* only if its 5th-percentile score stays positive.
5. **Signal** — `flow_z`: z-scored net signed notional of influential wallets
   over the trailing hour, per market.

### The agent crew

A sentinel loop runs three cadences: a 10s fast tick (data, cheap signals,
structural-change detector, PnL mark, checkpoint), a 90s analyst round, and a
15-minute graph refit. Each round fans out five LLM analysts — influence flow,
order-flow imbalance, whale flow, momentum/detector, microstructure — each fed
only pre-computed numbers. A guard rejects any rationale citing a number not in
its input packet. The **supervisor is deterministic arithmetic**: a weighted
vote with a hard threshold; the LLM explains, it never decides. Below the
threshold the crew HOLDs, and every HOLD is journaled — correct inaction is the
long-horizon skill.

Paper fills are pessimistic: buys at the live best ask, sells at the live best
bid, never mid. The process checkpoints every tick and resumes cleanly after a
kill — try it during a run.

## Run it

```bash
# backend (Python 3.12)
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
FIREWORKS_API_KEY=... .venv/bin/uvicorn app.main:app --port 8600
# without a key the analysts stay flat and the sentinel just holds — still live

# frontend
cd frontend
npm install && NEXT_PUBLIC_API_URL=http://localhost:8600 npm run dev
```

Tests: `cd backend && .venv/bin/python -m pytest`

Deploy: `render.yaml` defines a single Render web service (in-process state,
one worker; a restart demonstrates checkpoint-resume rather than breaking it).

## API

`GET /api/state` (3s poll drives the whole UI) · `/api/wallets` · `/api/edges`
· `/api/timeline` · `/api/health` · `/api/debug/poke` (force an analyst round).
