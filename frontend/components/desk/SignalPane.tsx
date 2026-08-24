"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { COLORS } from "@/lib/palette";
import { useSignalHistory } from "@/lib/api";
import { AGENT_METRICS, type AgentKey } from "@/lib/desk";

const config = {
  sig: { label: "Signal", color: "var(--chart-1)" }, // agent voice (orange)
} satisfies ChartConfig;

function fmtTime(t: number) {
  return new Date(t * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Raw-signal sub-chart under the price chart: the selected agent's own
 * metric at 10s cadence, with its decision band drawn as a reference zone.
 */
export default function SignalPane({
  agent,
  marketId,
  domain,
}: {
  agent: AgentKey;
  marketId: string | undefined;
  /** Optional x-window [t0, t1] (unix sec) to sync with the price chart. */
  domain?: [number, number];
}) {
  const metric = AGENT_METRICS[agent];
  const { data } = useSignalHistory(marketId);

  const points = useMemo(() => {
    // Guard against SWR handing us a stale market's buffer.
    const series =
      data && data.market_id === marketId ? (data.series ?? []) : [];
    let pts = series
      .filter((p) => p != null && isFinite(p[metric.field]))
      .map((p) => ({ t: p.ts, sig: p[metric.field] }));
    if (domain && isFinite(domain[0]) && isFinite(domain[1])) {
      const windowed = pts.filter(
        (p) => p.t >= domain[0] - 15 && p.t <= domain[1] + 15
      );
      // If the visible price window predates the signal buffer, fall back to
      // the full buffer rather than showing nothing.
      if (windowed.length >= 2) pts = windowed;
    }
    return pts;
  }, [data, marketId, metric.field, domain]);

  const band = metric.band;
  const bandV = band.kind === "sigma" || band.kind === "abs" ? band.v : 0;

  // Y-domain: tight around the data, but always wide enough to show the band.
  const yDomain = useMemo<[number, number]>(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of points) {
      if (p.sig < lo) lo = p.sig;
      if (p.sig > hi) hi = p.sig;
    }
    if (!points.length) {
      lo = 0;
      hi = 0;
    }
    if (bandV > 0) {
      lo = Math.min(lo, -bandV);
      hi = Math.max(hi, bandV);
    }
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
    const pad = Math.max((hi - lo) * 0.12, bandV > 0 ? bandV * 0.15 : 1e-6);
    return [lo - pad, hi + pad];
  }, [points, bandV]);

  // Sync with the price chart's window only when the signal buffer actually
  // covers a meaningful share of it; a young buffer gets its own time axis.
  const coverage =
    domain && points.length >= 2
      ? (points[points.length - 1].t - points[0].t) / (domain[1] - domain[0])
      : 0;
  const xDomain: [number | "dataMin", number | "dataMax"] =
    domain && coverage >= 0.3 ? domain : ["dataMin", "dataMax"];

  return (
    <div className="border-t pt-4">
      {points.length < 2 ? (
        <div className="flex h-[120px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed">
          <Skeleton className="h-[52px] w-[92%]" />
          <p className="text-xs text-muted-foreground">
            Signal buffer warming — 10s ticks accumulating…
          </p>
        </div>
      ) : (
        <ChartContainer config={config} className="h-[120px] w-full">
          <AreaChart data={points} margin={{ left: 4, right: 8, top: 4 }}>
            <defs>
              <linearGradient id="fillSig" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-sig)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-sig)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={xDomain}
              allowDataOverflow
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={56}
              tickFormatter={fmtTime}
              className="tnum"
              tick={{ fontSize: 10 }}
              height={20}
            />
            <YAxis
              domain={yDomain}
              tickLine={false}
              axisLine={false}
              width={44}
              tickCount={3}
              tickFormatter={(v: number) =>
                Math.abs(v) >= 1000
                  ? `${(v / 1000).toFixed(1)}k`
                  : v.toFixed(Math.abs(yDomain[1] - yDomain[0]) < 2 ? 2 : 1)
              }
              tick={{ fontSize: 10 }}
            />
            {bandV > 0 ? (
              <>
                <ReferenceArea
                  y1={-bandV}
                  y2={bandV}
                  fill={COLORS.algae}
                  fillOpacity={0.14}
                  stroke="none"
                />
                <ReferenceLine
                  y={bandV}
                  stroke={COLORS.algaeDeep}
                  strokeDasharray="4 4"
                  strokeOpacity={0.7}
                />
                <ReferenceLine
                  y={-bandV}
                  stroke={COLORS.algaeDeep}
                  strokeDasharray="4 4"
                  strokeOpacity={0.7}
                />
              </>
            ) : (
              <ReferenceLine
                y={0}
                stroke={COLORS.algaeDeep}
                strokeOpacity={0.7}
              />
            )}
            <ChartTooltip
              cursor={{ stroke: "var(--color-sig)", strokeDasharray: "3 3" }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) =>
                    payload?.[0] ? fmtTime(payload[0].payload.t) : ""
                  }
                  formatter={(value) => (
                    <span className="tnum">
                      {metric.label} {metric.fmt(value as number)}
                    </span>
                  )}
                />
              }
            />
            <Area
              dataKey="sig"
              type="monotone"
              stroke="var(--color-sig)"
              strokeWidth={2}
              fill="url(#fillSig)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {metric.label} · 10s ticks · rolling ~80 min
      </p>
    </div>
  );
}
