"use client";

import { useMemo, useState } from "react";
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

const RANGES = [
  { key: "2m", points: 40 },
  { key: "5m", points: 100 },
  { key: "All", points: Infinity },
] as const;

const config = {
  prob: { label: "Probability", color: "var(--chart-1)" }, // agent voice (orange)
} satisfies ChartConfig;

function fmtTime(t: number) {
  return new Date(t * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function PriceChart({ series }: { series: MidPoint[] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("All");

  const data = useMemo(() => {
    const r = RANGES.find((x) => x.key === range)!;
    const sliced =
      r.points === Infinity ? series : series.slice(-r.points);
    return sliced.map((p) => ({ t: p.t, prob: p.mid * 100 }));
  }, [series, range]);

  const domain = useMemo<[number, number]>(() => {
    if (!data.length) return [0, 100];
    const vals = data.map((d) => d.prob);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = Math.max(1.5, (hi - lo) * 0.25);
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
            onClick={() => setRange(r.key)}
            className={cn(
              "tnum",
              range === r.key && "font-semibold"
            )}
          >
            {r.key}
          </Button>
        ))}
      </div>

      {data.length < 2 ? (
        <div className="flex h-[320px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
          <Skeleton className="h-[240px] w-[92%]" />
          <p className="text-sm text-muted-foreground">
            Accumulating live price points…
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
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={48}
              tickFormatter={fmtTime}
              className="tnum"
              tick={{ fontSize: 11 }}
            />
            <YAxis
              domain={domain}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
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
