"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/palette";
import { AGENT_METRICS, type AgentKey } from "@/lib/desk";
import type { Market } from "@/lib/types";

/**
 * Compact ranked list of markets through the selected agent's lens.
 * Clicking a row pins the desk's focus to that market.
 */
export default function MarketRail({
  agent,
  ranked,
  focusedId,
  onPick,
}: {
  agent: AgentKey;
  ranked: Market[];
  focusedId: string | undefined;
  onPick: (marketId: string) => void;
}) {
  const metric = AGENT_METRICS[agent];
  const top = ranked.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Markets by {metric.label}</CardTitle>
        <CardDescription>
          Ranked by this analyst&apos;s signal. Click to refocus the desk.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {top.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-4/5" />
          </div>
        ) : (
          top.map((m, i) => {
            const focused = m.market_id === focusedId;
            const held = m.position != null;
            const v = m[metric.field] ?? 0;
            return (
              <button
                key={m.market_id}
                type="button"
                onClick={() => onPick(m.market_id)}
                aria-pressed={focused}
                className={cn(
                  "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                  "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  focused
                    ? "border-[var(--agent)] ring-1 ring-[var(--agent)]/30"
                    : "border-transparent"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="tnum shrink-0 text-[10px] font-semibold text-muted-foreground">
                    #{i + 1}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-xs",
                      focused ? "font-semibold" : "text-foreground/80"
                    )}
                  >
                    {m.question}
                  </span>
                  {held && (
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: COLORS.algaeDeep }}
                      title="Position held"
                    />
                  )}
                  <span
                    className="tnum shrink-0 text-xs font-semibold"
                    style={focused ? { color: COLORS.agent } : undefined}
                  >
                    {metric.fmt(v)}
                  </span>
                </div>
                {m.detector !== "quiet" && (
                  <Badge
                    variant="outline"
                    className="mt-1 h-4 px-1.5 text-[9px] uppercase tracking-wider"
                    style={{
                      color: COLORS.agentStrong,
                      borderColor: COLORS.agentStrong,
                    }}
                  >
                    {m.detector.replace(/_/g, " ")}
                  </Badge>
                )}
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
