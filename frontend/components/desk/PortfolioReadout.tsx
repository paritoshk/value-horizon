"use client";

import { COLORS } from "@/lib/palette";
import { fmtUsd } from "@/lib/api";
import type { Portfolio } from "@/lib/types";

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
}: {
  portfolio: Portfolio | undefined;
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
