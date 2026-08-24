"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMarketHistory } from "./api";

// The three agents shown on the desk, mapped to the API's analyst `name`s.
export const AGENTS = [
  {
    key: "influence_flow",
    label: "Lead-lag influence",
    attribute: "Influential wallets leading price",
    initials: "LL",
  },
  {
    key: "flow_imbalance",
    label: "Order-flow imbalance",
    attribute: "Buy vs. sell pressure",
    initials: "OF",
  },
  {
    key: "whale",
    label: "Whale flow",
    attribute: "Large net wallet positioning",
    initials: "WF",
  },
] as const;

export type AgentKey = (typeof AGENTS)[number]["key"];

export interface MidPoint {
  t: number; // seconds
  mid: number; // probability 0..1
}

/**
 * Accumulate the focused market's `mid` across /api/state polls. Used only as
 * the live tail appended after the last real history bar, so the head of the
 * chart moves between 30s history refreshes. Resets when focus changes.
 */
function useLiveTail(
  marketId: string | undefined,
  mid: number | null | undefined,
  ts: number | undefined,
  cap = 240
): MidPoint[] {
  const [series, setSeries] = useState<MidPoint[]>([]);
  const marketRef = useRef<string | undefined>(undefined);
  const lastTsRef = useRef<number>(0);

  useEffect(() => {
    if (!marketId || mid == null || !isFinite(mid)) return;
    const t = ts ?? Date.now() / 1000;

    if (marketRef.current !== marketId) {
      // focus market changed — start a fresh series
      marketRef.current = marketId;
      lastTsRef.current = t;
      setSeries([{ t, mid }]);
      return;
    }
    // de-dupe identical polls
    if (t === lastTsRef.current) return;
    lastTsRef.current = t;
    setSeries((prev) => {
      const next = [...prev, { t, mid }];
      return next.length > cap ? next.slice(next.length - cap) : next;
    });
  }, [marketId, mid, ts, cap]);

  return series;
}

/**
 * Real ~5-minute history bars from /api/history, with the live mid from
 * /api/state polls appended after the last bar. The result is a genuinely
 * moving stock-tracker series instead of a flat client-side accumulation.
 */
export function useProbabilitySeries(
  marketId: string | undefined,
  mid: number | null | undefined,
  ts: number | undefined
): MidPoint[] {
  const { data: history } = useMarketHistory(marketId);
  const tail = useLiveTail(marketId, mid, ts);

  return useMemo(() => {
    // Guard against keepPreviousData handing us the previous market's bars.
    const bars =
      history && history.market_id === marketId ? history.series : [];
    const out: MidPoint[] = bars.map((b) => ({ t: b.ts, mid: b.p }));
    const lastBarTs = out.length ? out[out.length - 1].t : 0;
    for (const p of tail) {
      if (p.t > lastBarTs) out.push(p);
    }
    return out;
  }, [history, tail, marketId]);
}
