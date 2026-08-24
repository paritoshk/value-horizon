"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { COLORS } from "@/lib/palette";
import { useGraph } from "@/lib/api";

/** Percentile-clamp a value array to 0..100 SVG coordinates. */
function normalize(values: number[]): (v: number) => number {
  if (!values.length) return () => 50;
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.02)];
  const hi = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.98))];
  const span = hi - lo || 1;
  return (v) => Math.max(2, Math.min(98, ((v - lo) / span) * 92 + 4));
}

/**
 * Wallet influence map for the lead-lag analyst: every tracked wallet from
 * the fitted graph, influential ones in the agent's orange.
 */
export default function WalletScatter({
  nFills,
}: {
  nFills: number | undefined;
}) {
  const { wallets } = useGraph(nFills);

  const dots = useMemo(() => {
    if (!wallets?.length) return null;
    const nx = normalize(wallets.map((w) => w.x));
    const ny = normalize(wallets.map((w) => w.y));
    const maxLog = Math.max(
      1,
      ...wallets.map((w) => Math.log10(1 + Math.max(0, w.notional)))
    );
    return wallets.map((w) => ({
      id: w.id,
      cx: nx(w.x),
      cy: ny(w.y),
      r: 0.8 + (Math.log10(1 + Math.max(0, w.notional)) / maxLog) * 2.4,
      fill: w.influential ? COLORS.agent : COLORS.algae,
      opacity: 0.25 + 0.75 * Math.min(1, Math.abs(w.influence)),
    }));
  }, [wallets]);

  const nInfluential = wallets?.filter((w) => w.influential).length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Wallet influence map</CardTitle>
        <CardDescription>
          Every tracked wallet from the fitted lead-lag graph — orange dots
          lead price, size scales with notional.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!dots ? (
          <Skeleton className="h-[180px] w-full" />
        ) : (
          <>
            <svg
              viewBox="0 0 100 100"
              className="h-[180px] w-full rounded-lg border bg-muted/20"
              role="img"
              aria-label={`Wallet scatter: ${dots.length} wallets, ${nInfluential} influential`}
              preserveAspectRatio="none"
            >
              {dots.map((d) => (
                <circle
                  key={d.id}
                  cx={d.cx}
                  cy={d.cy}
                  r={d.r}
                  fill={d.fill}
                  fillOpacity={d.opacity}
                />
              ))}
            </svg>
            <p className="tnum mt-2 text-xs text-muted-foreground">
              {dots.length.toLocaleString("en-US")} wallets · {nInfluential}{" "}
              influential
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
