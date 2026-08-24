"use client";

import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { COLORS } from "@/lib/palette";
import { fmtUsd } from "@/lib/api";
import type { PnlPoint, Portfolio } from "@/lib/types";

const START_EQUITY = 1000;

function Row({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="tnum text-sm font-semibold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

export default function PortfolioReadout({
  portfolio,
  pnl: pnlSeries,
}: {
  portfolio: Portfolio | undefined;
  pnl?: PnlPoint[];
}) {
  const p = portfolio;
  const equity = p?.equity ?? START_EQUITY;
  const pnl = equity - START_EQUITY;
  const pnlPct = (pnl / START_EQUITY) * 100;
  const invested = p ? Math.max(0, p.equity - p.cash) : 0;
  const exposure = p && p.equity > 0 ? (invested / p.equity) * 100 : 0;
  const pnlColor = pnl >= 0 ? COLORS.up : COLORS.down;

  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Paper P&amp;L
      </div>
      {/* Agent P&L is the agent's own result → sunrise orange (agent voice) */}
      <div
        className="tnum mt-1 text-4xl font-semibold tracking-tight"
        style={{ color: COLORS.agent }}
      >
        {pnl >= 0 ? "+" : "−"}${fmtUsd(Math.abs(pnl), 2)}
      </div>
      <div className="tnum mt-1 text-sm font-medium" style={{ color: pnlColor }}>
        {pnl >= 0 ? "+" : ""}
        {pnlPct.toFixed(2)}% since $1,000 start
      </div>

      {pnlSeries && pnlSeries.length >= 2 && (
        <div className="mt-3 h-12 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={pnlSeries}
              margin={{ top: 2, bottom: 2, left: 0, right: 0 }}
            >
              <defs>
                <linearGradient id="fillPnl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.agent} stopOpacity={0.3} />
                  <stop
                    offset="100%"
                    stopColor={COLORS.agent}
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Area
                dataKey="equity"
                type="monotone"
                stroke={COLORS.agent}
                strokeWidth={1.5}
                fill="url(#fillPnl)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-4 divide-y">
        <Row label="Equity" value={`$${fmtUsd(equity, 2)}`} />
        <Row label="Cash" value={`$${fmtUsd(p?.cash, 2)}`} />
        <Row label="Realized" value={`$${fmtUsd(p?.realized, 2)}`} />
        <Row label="Unrealized" value={`$${fmtUsd(p?.unrealized, 2)}`} />
        <Row label="Exposure" value={`${exposure.toFixed(0)}%`} />
      </div>
    </div>
  );
}
