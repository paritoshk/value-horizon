"use client";

import useSWR from "swr";
import type {
  StateResponse,
  WalletsResponse,
  EdgesResponse,
  TimelineResponse,
  HistoryResponse,
} from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8600";

// Fetcher, polling interval and dedupe live in <Providers> (SWRConfig at the
// root layout), so every route shares one cache entry per key and navigation
// never triggers a duplicate fetch.

export function useSentinelState() {
  return useSWR<StateResponse>("/api/state");
}

/**
 * Wallets/edges refetch ONLY when model.stages.n_fills changes (the key
 * embeds the fingerprint); refreshInterval is disabled for these keys.
 */
export function useGraph(nFills: number | undefined) {
  const key = nFills === undefined ? 0 : nFills;
  const opts = { refreshInterval: 0, revalidateOnFocus: false as const };
  const wallets = useSWR<WalletsResponse>(["/api/wallets", key], opts);
  const edges = useSWR<EdgesResponse>(["/api/edges", key], opts);
  return { wallets: wallets.data?.wallets, edges: edges.data?.edges };
}

export function useTimeline(limit = 200) {
  return useSWR<TimelineResponse>(`/api/timeline?limit=${limit}`);
}

/**
 * Real price history for one market (~5-minute bars). Refreshes every 30s;
 * between refreshes the desk appends the live mid from /api/state polls.
 */
export function useMarketHistory(marketId: string | undefined, points = 300) {
  return useSWR<HistoryResponse>(
    marketId ? `/api/history?market_id=${marketId}&points=${points}` : null,
    { refreshInterval: 30_000, revalidateOnFocus: false }
  );
}

export function fmtAgo(s: number | null | undefined): string {
  if (s == null || !isFinite(s)) return "–";
  if (s < 60) return `${Math.max(0, Math.round(s))}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export function fmtUsd(v: number | null | undefined, digits = 2): string {
  if (v == null || !isFinite(v)) return "–";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtProb(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return v.toFixed(3);
}
