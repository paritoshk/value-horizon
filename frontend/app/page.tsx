"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSentinelState } from "@/lib/api";
import { hasModel, hasRound } from "@/lib/types";
import {
  AGENTS,
  AGENT_METRICS,
  rankMarketsFor,
  type AgentKey,
  useProbabilitySeries,
} from "@/lib/desk";
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
import SignalPane from "@/components/desk/SignalPane";
import MarketRail from "@/components/desk/MarketRail";
import TrackRecord from "@/components/desk/TrackRecord";
import WalletScatter from "@/components/desk/WalletScatter";
import PipelineIso from "@/components/desk/PipelineIso";
import TradesTable from "@/components/desk/TradesTable";
import PortfolioReadout from "@/components/desk/PortfolioReadout";
import { TrendingDown, TrendingUp } from "lucide-react";

export default function DeskPage() {
  const { data: state } = useSentinelState();
  const [selected, setSelected] = useState<AgentKey>("influence_flow");
  const [pinned, setPinned] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("All");

  // Sidebar open state, restored from the shadcn cookie after mount so the
  // collapse survives reloads (the provider writes the cookie on toggle).
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)sidebar_state=(true|false)/);
    if (m) setSidebarOpen(m[1] === "true");
  }, []);

  // Selecting an analyst re-contextualizes the whole desk: drop any pinned
  // market so the agent's own top-ranked market takes focus.
  const handleSelect = useCallback((k: AgentKey) => {
    setSelected(k);
    setPinned(null);
  }, []);

  const round = state && hasRound(state.agents) ? state.agents : null;
  const analysts = round?.analysts ?? [];
  const warming = !round;
  const model = state && hasModel(state.model) ? state.model : null;

  const metric = AGENT_METRICS[selected];

  // Markets through the selected agent's lens, strongest signal first.
  const ranked = useMemo(
    () => rankMarketsFor(selected, state?.markets ?? []),
    [selected, state?.markets]
  );

  const focusMarket = useMemo(() => {
    if (!ranked.length) return undefined;
    if (pinned) {
      const m = ranked.find((x) => x.market_id === pinned);
      if (m) return m;
    }
    const top = ranked[0];
    // Signal buffer still warming (top metric flat zero) — fall back to the
    // market the analyst round is actually debating.
    if (Math.abs(top[metric.field] ?? 0) === 0 && round) {
      return ranked.find((m) => m.market_id === round.market_id) ?? top;
    }
    return top;
  }, [ranked, pinned, metric.field, round]);

  const focusRank = focusMarket
    ? ranked.findIndex((m) => m.market_id === focusMarket.market_id) + 1
    : 0;

  // Real ~5-minute history bars + the live mid appended on each poll.
  const series = useProbabilitySeries(
    focusMarket?.market_id,
    focusMarket?.mid,
    state?.ts
  );

  const selectedAgent = AGENTS.find((a) => a.key === selected)!;
  const selectedAnalyst = analysts.find((a) => a.name === selected);

  const currentPct = focusMarket?.mid != null ? focusMarket.mid * 100 : null;

  // Change over the visible window (matches the chart's timeframe pills).
  const windowed = useMemo(() => sliceRange(series, range), [series, range]);
  const change =
    windowed.length >= 2
      ? (windowed[windowed.length - 1].mid - windowed[0].mid) * 100
      : 0;
  const up = change >= 0;

  // Shared x-window so the signal sub-chart tracks the price chart.
  const chartDomain = useMemo<[number, number] | undefined>(() => {
    if (windowed.length < 2) return undefined;
    return [windowed[0].t, windowed[windowed.length - 1].t];
  }, [windowed]);

  // Which analyst "owns" each market (ranks it #1) — shown in the trades table.
  const ownerInitials = useMemo(() => {
    const out: Record<string, string> = {};
    if (!state?.markets?.length) return out;
    for (const agent of AGENTS) {
      const top = rankMarketsFor(agent.key, state.markets)[0];
      if (top && out[top.market_id] === undefined) {
        out[top.market_id] = agent.initials;
      }
    }
    return out;
  }, [state?.markets]);

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
        onSelect={handleSelect}
        warming={warming}
      />

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto grid max-w-[1360px] grid-cols-1 gap-8 px-6 py-8 xl:grid-cols-[minmax(0,1fr)_300px]">
          {/* Left column — the agent's working desk */}
          <div className="min-w-0 space-y-8">
            {/* Focus market header — Robinhood Legend: big number up top */}
            <section>
              <div className="flex flex-wrap items-center gap-2">
                <SidebarTrigger className="-ml-1.5" />
                <Badge variant="secondary" className="tnum font-medium">
                  {selectedAgent.label}
                  {focusMarket && focusRank > 0
                    ? ` · ranked #${focusRank} by ${metric.label} ${metric.fmt(
                        focusMarket[metric.field] ?? 0
                      )}`
                    : " is driving"}
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

              {!focusMarket ? (
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
                    Implied YES probability · 5-minute venue bars with a live
                    head
                  </p>
                </>
              )}
            </section>

            {/* Supervisor decision — the synthesis is the agent's own voice */}
            {sup && (
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle className="text-base">
                      Supervisor decision
                    </CardTitle>
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
                <CardContent className="space-y-4">
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: COLORS.agentStrong }}
                  >
                    {sup.synthesis}
                  </p>

                  {/* All voting analysts, incl. momentum + microstructure */}
                  {analysts.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {analysts.map((a) => (
                        <span
                          key={a.name}
                          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                        >
                          <span
                            className="size-1.5 rounded-full"
                            style={{ background: stanceColor(a.stance) }}
                          />
                          <span className="font-medium">
                            {a.name.replace(/_/g, " ")}
                          </span>
                          <span className="tnum text-muted-foreground">
                            {(a.confidence * 100).toFixed(0)}%
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  {sup.reasons.length > 0 && (
                    <ul className="space-y-1">
                      {sup.reasons.map((r, i) => (
                        <li
                          key={i}
                          className="flex gap-2 text-xs text-muted-foreground"
                        >
                          <span
                            className="mt-1.5 size-1 shrink-0 rounded-full"
                            style={{ background: COLORS.algaeDeep }}
                          />
                          {r}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Chart + the agent's raw signal underneath */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Probability over time
                </CardTitle>
                <CardDescription>
                  Real 5-minute bars for the focus market; the head ticks with
                  each live poll. Below it, the raw signal{" "}
                  {selectedAgent.label} is reading.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <PriceChart
                  series={series}
                  range={range}
                  onRangeChange={setRange}
                />
                <SignalPane
                  agent={selected}
                  marketId={focusMarket?.market_id}
                  domain={chartDomain}
                />
              </CardContent>
            </Card>

            {/* Live pipeline — isometric four-plane stack */}
            <PipelineIso
              state={state}
              selected={selected}
              focusMarket={focusMarket}
            />

            {/* Wallet influence map — only meaningful for the lead-lag agent */}
            {selected === "influence_flow" && (
              <WalletScatter nFills={model?.stages?.n_fills} />
            )}

            {/* Trades */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Trades</CardTitle>
                <CardDescription>
                  Paper fills from the supervisor.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TradesTable
                  trades={state?.trades ?? []}
                  ownerInitials={ownerInitials}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right rail — the agent's watchlist, memory and book */}
          <div className="min-w-0 space-y-6">
            <MarketRail
              agent={selected}
              ranked={ranked}
              focusedId={focusMarket?.market_id}
              onPick={setPinned}
            />

            <TrackRecord agent={selected} backtest={model?.backtest} />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Portfolio</CardTitle>
              </CardHeader>
              <CardContent>
                <Separator className="mb-2" />
                <PortfolioReadout
                  portfolio={state?.portfolio}
                  pnl={state?.pnl}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </SidebarProvider>
  );
}
