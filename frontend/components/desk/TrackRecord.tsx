"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { stanceColor, stanceLabel } from "@/lib/palette";
import { useTimeline } from "@/lib/api";
import type { AgentKey } from "@/lib/desk";
import type { Backtest, ICStat } from "@/lib/types";

function fmtTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtIC(s: ICStat): string {
  const sign = s.ic >= 0 ? "+" : "−";
  return `IC ${sign}${Math.abs(s.ic).toFixed(3)} · p=${s.p_value.toFixed(2)}`;
}

/**
 * The selected analyst's recent votes (from the analyst_round timeline) as a
 * row of stance ticks, plus its backtested skill stat when one exists.
 */
export default function TrackRecord({
  agent,
  backtest,
}: {
  agent: AgentKey;
  backtest: Backtest | undefined;
}) {
  const { data } = useTimeline();

  const votes = useMemo(() => {
    const events = data?.events ?? [];
    const rounds = events.filter(
      (e) => e.type === "analyst_round" && e.votes && e.votes[agent]
    );
    return rounds.slice(-12).map((e) => {
      const [stance, conf] = e.votes![agent];
      return { ts: e.ts, stance, conf, question: e.question };
    });
  }, [data, agent]);

  const ic: ICStat | null | undefined =
    agent === "influence_flow"
      ? backtest?.ic_flow
      : agent === "flow_imbalance"
        ? backtest?.ic_imbalance
        : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Track record</CardTitle>
        <CardDescription>
          Last {votes.length || 12} votes this analyst cast.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!data ? (
          <Skeleton className="h-8 w-full" />
        ) : votes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No analyst rounds recorded yet — warming up.
          </p>
        ) : (
          <div className="flex h-9 items-end gap-1.5">
            {votes.map((v, i) => (
              <Tooltip key={`${v.ts}-${i}`}>
                <TooltipTrigger asChild>
                  <span
                    className="w-2 cursor-default rounded-sm"
                    style={{
                      height: `${Math.round(14 + v.conf * 22)}px`,
                      background: stanceColor(v.stance),
                      opacity: 0.35 + 0.65 * Math.min(1, Math.max(0, v.conf)),
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <span className="tnum">
                    {fmtTime(v.ts)} · {stanceLabel(v.stance)} ·{" "}
                    {(v.conf * 100).toFixed(0)}% conf
                  </span>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        <div className="mt-4 border-t pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Backtested skill
          </div>
          {agent === "whale" ? (
            <p className="mt-1 text-xs text-muted-foreground">
              n/a — not backtested
            </p>
          ) : ic ? (
            <p className="tnum mt-1 text-sm font-semibold">{fmtIC(ic)}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              No backtest sample yet.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
