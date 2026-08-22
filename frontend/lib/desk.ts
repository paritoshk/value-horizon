"use client";

import { useEffect, useRef, useState } from "react";

// The three agents shown on the desk, mapped to the API's analyst `name`s.
export const AGENTS = [
  {
    key: "influence_flow",
    label: "Lead-lag influence",
    attribute: "Influential wallets leading price",
  },
  {
    key: "flow_imbalance",
    label: "Order-flow imbalance",
    attribute: "Buy vs. sell pressure",
  },
  {
    key: "whale",
    label: "Whale flow",
    attribute: "Large net wallet positioning",
  },
] as const;

export type AgentKey = (typeof AGENTS)[number]["key"];

export interface MidPoint {
  t: number; // seconds
  mid: number; // probability 0..1
}

/**
 * Accumulate the focused market's `mid` across polls into a client-side series
 * (no per-market history endpoint exists). Resets when the focused market
 * changes. Keeps the last `cap` points.
 */
export function useMidSeries(
  marketId: string | undefined,
  mid: number | null | undefined,
  ts: number | undefined,
  cap = 120
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
