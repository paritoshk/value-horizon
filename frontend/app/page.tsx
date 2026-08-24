"use client";

import { useEffect, useMemo, useState } from "react";
import { useSentinelState } from "@/lib/api";
import { hasRound } from "@/lib/types";
import { AGENTS, type AgentKey, useProbabilitySeries } from "@/lib/desk";
import { COLORS, stanceColor, stanceLabel } from "@/lib/palette";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import AgentSidebar from "@/components/desk/AgentSidebar";
import PriceChart, {
  sliceRange,
  type RangeKey,
} from "@/components/desk/PriceChart";
import PipelineIso from "@/components/desk/PipelineIso";
import TradesTable from "@/components/desk/TradesTable";
import PortfolioReadout from "@/components/desk/PortfolioReadout";
import { TrendingDown, TrendingUp } from "lucide-react";

export default function DeskPage() {
  const { data: state } = useSentinelState();
  const [selected, setSelected] = useState<AgentKey>("influence_flow");
  const [range, setRange] = useState<RangeKey>("All");

  // Sidebar open state, restored from the shadcn cookie after mount so the
  // collapse survives reloads (the provider writes the cookie on toggle).
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)sidebar_state=(true|false)/);
    if (m) setSidebarOpen(m[1] === "true");
  }, []);

  const round = state && hasRound(state.agents) ? state.agents : null;
  const analysts = round?.analysts ?? [];
  const warming = !round;

  const focusMarket = useMemo(() => {
    if (!state || !round) return undefined;
    return state.markets.find((m) => m.market_id === round.market_id);
  }, [state, round]);

  // Real ~5-minute history bars + the live mid appended on each poll.
  const series = useProbabilitySeries(
    focusMarket?.market_id,
    focusMarket?.mid,
    state?.ts
  );

  const selectedAgent = AGENTS.find((a) => a.key === selected)!;
  const selectedAnalyst = analysts.find((a) => a.name === selected);

  const currentPct =
    focusMarket?.mid != null ? focusMarket.mid * 100 : null;

  // Change over the visible window (matches the chart's timeframe pills).
  const windowed = useMemo(() => sliceRange(series, range), [series, range]);
  const change =
    windowed.length >= 2
      ? (windowed[windowed.length - 1].mid - windowed[0].mid) * 100
      : 0;
  const up = change >= 0;

  const sup = round?.supervisor;

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      style={
        {
          "--sidebar-width": "22rem",
          "--sidebar-width-icon": "3.5rem",
        } as React.CSSProperties
      }
      className="min-h-0 items-stretch"
    >
      <AgentSidebar
        analysts={analysts}
        selected={selected}
        onSelect={setSelected}
        warming={warming}
      />

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-[1000px] space-y-8 px-6 py-8">
          {/* Focus market header — Robinhood Legend: big number up top */}
          <section>
            <div className="flex flex-wrap items-center gap-2">
              <SidebarTrigger className="-ml-1.5" />
              <Badge variant="secondary" className="font-medium">
                {selectedAgent.label} is driving
              </Badge>
              {selectedAnalyst && (
                <Badge
                  variant="outline"
                  style={{
                    color: stanceColor(selectedAnalyst.stance),
                    borderColor: stanceColor(selectedAnalyst.stance),
                  }}
                >
                  {stanceLabel(selectedAnalyst.stance)} ·{" "}
                  {(selectedAnalyst.confidence * 100).toFixed(0)}% conf
                </Badge>
              )}
            </div>

            {warming || !focusMarket ? (
              <div className="mt-3 space-y-3">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-14 w-40" />
              </div>
            ) : (
              <>
                <h1 className="mt-3 text-xl font-medium leading-snug tracking-tight text-foreground/90">
                  {focusMarket.question}
                </h1>
                <div className="mt-3 flex items-end gap-4">
                  <div className="tnum text-6xl font-semibold tracking-tight">
                    {currentPct != null ? `${currentPct.toFixed(1)}` : "—"}
                    <span className="text-3xl text-muted-foreground">%</span>
                  </div>
                  <div
                    className="tnum mb-2 flex items-center gap-1 text-lg font-medium"
                    style={{ color: up ? COLORS.up : COLORS.down }}
                  >
                    {up ? (
                      <TrendingUp className="size-5" />
                    ) : (
                      <TrendingDown className="size-5" />
                    )}
                    {up ? "+" : ""}
                    {change.toFixed(2)} pts
                  </div>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Implied YES probability · 5-minute venue bars with a live head
                </p>
              </>
            )}
          </section>

          {/* Supervisor decision — the synthesis is the agent's own voice */}
          {sup && (
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base">Supervisor decision</CardTitle>
                  <CardDescription>
                    Score decided by arithmetic; the note below is the agent
                    explaining itself.
                  </CardDescription>
                </div>
                <Badge
                  className="text-sm"
                  style={
                    sup.action === "TRADE"
                      ? {
                          background: COLORS.agent,
                          color: "#fff",
                          borderColor: COLORS.agent,
                        }
                      : undefined
                  }
                  variant={sup.action === "TRADE" ? "default" : "outline"}
                >
                  {sup.action} · {sup.score >= 0 ? "+" : ""}
                  {sup.score.toFixed(2)}
                </Badge>
              </CardHeader>
              <CardContent>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: COLORS.agentStrong }}
                >
                  {sup.synthesis}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Live pipeline — isometric four-plane stack */}
          <PipelineIso state={state} />

          {/* Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Probability over time</CardTitle>
              <CardDescription>
                Real 5-minute bars for the focus market; the head ticks with
                each live poll.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PriceChart
                series={series}
                range={range}
                onRangeChange={setRange}
              />
            </CardContent>
          </Card>

          {/* Trades + portfolio */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Trades</CardTitle>
                <CardDescription>Paper fills from the supervisor.</CardDescription>
              </CardHeader>
              <CardContent>
                <TradesTable trades={state?.trades ?? []} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Portfolio</CardTitle>
              </CardHeader>
              <CardContent>
                <Separator className="mb-2" />
                <PortfolioReadout portfolio={state?.portfolio} />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </SidebarProvider>
  );
}
