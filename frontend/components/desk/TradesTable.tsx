"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { COLORS } from "@/lib/palette";
import { fmtProb } from "@/lib/api";
import type { Trade } from "@/lib/types";

function fmtTime(ts?: number) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function TradesTable({
  trades,
  ownerInitials,
}: {
  trades: Trade[];
  /** market_id → initials of the analyst that ranks that market #1. */
  ownerInitials?: Record<string, string>;
}) {
  if (!trades.length) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center">
        <p className="text-sm font-medium">No fills yet</p>
        <p className="text-sm text-muted-foreground">
          The supervisor is holding until the arithmetic clears the threshold.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Market</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">P&amp;L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((t, i) => {
            const pnl = typeof t.pnl === "number" ? t.pnl : null;
            const pnlColor =
              pnl == null ? undefined : pnl >= 0 ? COLORS.up : COLORS.down;
            return (
              <TableRow key={`${t.ts ?? i}-${i}`}>
                <TableCell className="tnum text-muted-foreground">
                  {fmtTime(t.ts)}
                </TableCell>
                <TableCell className="max-w-[280px]">
                  <span className="flex items-center gap-1.5">
                    {t.market_id && ownerInitials?.[t.market_id] && (
                      <span
                        className="grid size-5 shrink-0 place-items-center rounded border text-[9px] font-bold text-muted-foreground"
                        title="Analyst ranking this market #1"
                      >
                        {ownerInitials[t.market_id]}
                      </span>
                    )}
                    <span className="truncate">
                      {t.question ?? t.market_id ?? "—"}
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    style={{
                      color: COLORS.agent,
                      borderColor: COLORS.agent,
                    }}
                  >
                    {t.side ?? t.type ?? "—"}
                  </Badge>
                </TableCell>
                <TableCell className="tnum text-right">
                  {typeof t.qty === "number" ? t.qty.toFixed(2) : "—"}
                </TableCell>
                <TableCell className="tnum text-right">
                  {fmtProb(t.fill_px as number | null | undefined)}
                </TableCell>
                <TableCell
                  className="tnum text-right font-medium"
                  style={{ color: pnlColor }}
                >
                  {pnl == null
                    ? "—"
                    : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
