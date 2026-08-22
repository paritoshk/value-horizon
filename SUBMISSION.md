# Lead-Lag Sentinel — Project Submission

**Live demo:** https://lead-lag-sentinel.vercel.app · **API:** https://lead-lag-sentinel.onrender.com · **Repo:** https://github.com/paritoshk/value-horizon

## One-liner
A long-horizon sentinel agent that watches live Polymarket order flow, learns which wallets *lead* and which *follow*, and paper-trades the influence signal — with every decision made by arithmetic, and every hold journaled.

## What it does
- **Live data only.** Discovers the top Polymarket markets by 24h volume and streams wallet-level fills, order books, and price history from public APIs. No mocks, no replays.
- **Influence pipeline (all pure math, on screen):** lead-lag graph (A trades, B follows within 1h) → shuffled-time permutation null (kills the "everyone saw the same news" confound) → random-forest ablation attribution with honest out-of-bag R² → day-block bootstrap (a wallet is influential only if its 5th-percentile score stays positive) → per-market influence-flow z-score.
- **A crew that reads, a supervisor that computes.** Three analyst agents (lead-lag influence, order-flow imbalance, whale flow) each receive pre-computed numbers only and explain their stance in plain language; a guard rejects any rationale citing a number not in its input. The trade decision is a weighted arithmetic vote with a hard threshold — the LLM explains, it never decides.
- **Honest sizing from a walk-forward backtest.** Spearman IC of the signal vs 1-hour forward moves, against a raw-imbalance baseline, live: full tickets only if the signal beats the baseline out-of-sample; otherwise $10 probes. The system displays its own negative IC when that's the truth.
- **Pessimistic paper trading.** Buys at the live ask, sells at the live bid, never mid; both YES and NO tokens.
- **Long-horizon by construction.** Three cadences (10s data tick / 90s analyst round / 15min graph refit), an append-only journal where correct inaction is a first-class event ("87 rounds · 4 acted"), and atomic checkpoints — kill the process and it resumes with positions intact.

## Why it's a long-horizon agent
The skill being demonstrated is acting at the right moment, not constantly: the sentinel holds through most rounds and journals why, survives restarts via checkpoint/resume, and re-fits its influence graph as live fills accumulate. It is the "waiting agent" pattern with a real reward signal (paper P&L against a live order book).

## Stack
FastAPI + asyncio sentinel (Render) · scikit-learn / pandas influence pipeline · GLM via Sail Research (OpenAI-compatible) for analyst rationales · Braintrust tracing · Next.js + shadcn/ui desk (Vercel) · live Polymarket Gamma/CLOB/Data APIs.

## Honest limitations
Walk-forward IC on today's sports-heavy window is negative — the system correctly self-limits to probe sizing and says so on screen. The free-tier backend cold-starts (~2 min) after idle. Paper only; no real capital.
