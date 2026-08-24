"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MidPoint } from "@/lib/desk";

// Timeframe pills select how much fetched history is shown.
export const RANGES = [
  { key: "1h", seconds: 3600 },
  { key: "6h", seconds: 6 * 3600 },
  { key: "All", seconds: Infinity },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

/** Slice a series to the visible window for a range key (shared with the header math). */
export function sliceRange(series: MidPoint[], range: RangeKey): MidPoint[] {
  const r = RANGES.find((x) => x.key === range)!;
  if (!series.length || r.seconds === Infinity) return series;
  const cutoff = series[series.length - 1].t - r.seconds;
  return series.filter((p) => p.t >= cutoff);
}

const config = {
  prob: { label: "Probability", color: "var(--chart-1)" }, // agent voice (orange)
} satisfies ChartConfig;

function fmtTime(t: number) {
  return new Date(t * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function PriceChart({
  series,
  range,
  onRangeChange,
}: {
  series: MidPoint[];
  range: RangeKey;
  onRangeChange: (r: RangeKey) => void;
}) {
  const data = useMemo(
    () => sliceRange(series, range).map((p) => ({ t: p.t, prob: p.mid * 100 })),
    [series, range]
  );

  // Tight y-domain around the data — [min - pad, max + pad], pad ≈ 5% of the
  // range with a 1pt floor — so real movement reads like a stock tracker.
  const domain = useMemo<[number, number]>(() => {
    if (!data.length) return [0, 100];
    let lo = Infinity;
    let hi = -Infinity;
    for (const d of data) {
      if (d.prob < lo) lo = d.prob;
      if (d.prob > hi) hi = d.prob;
    }
    const pad = Math.max(1, (hi - lo) * 0.05);
    return [Math.max(0, lo - pad), Math.min(100, hi + pad)];
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-1">
        {RANGES.map((r) => (
          <Button
            key={r.key}
            variant={range === r.key ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onRangeChange(r.key)}
            className={cn("tnum", range === r.key && "font-semibold")}
          >
            {r.key}
          </Button>
        ))}
      </div>

      {data.length < 2 ? (
        <div className="flex h-[320px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
          <Skeleton className="h-[240px] w-[92%]" />
          <p className="text-sm text-muted-foreground">
            Loading price history…
          </p>
        </div>
      ) : (
        <ChartContainer config={config} className="h-[320px] w-full">
          <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="fillProb" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-prob)"
                  stopOpacity={0.35}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-prob)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={56}
              tickFormatter={fmtTime}
              className="tnum"
              tick={{ fontSize: 11 }}
            />
            <YAxis
              domain={domain}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              tick={{ fontSize: 11 }}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--color-prob)", strokeDasharray: "3 3" }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) =>
                    payload?.[0] ? fmtTime(payload[0].payload.t) : ""
                  }
                  formatter={(value) => (
                    <span className="tnum">
                      {(value as number).toFixed(1)}%
                    </span>
                  )}
                />
              }
            />
            <Area
              dataKey="prob"
              type="monotone"
              stroke="var(--color-prob)"
              strokeWidth={2.5}
              fill="url(#fillProb)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}
