"use client";

// CSS-3D isometric "four planes" widget — the live pipeline, matching the
// Quant Agent design system reference (rotateX(58deg) rotateZ(-45deg),
// plates at translateZ 0/58/128/206, borders #C7D8CB, orange only on the
// active plane). No three.js.

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtAgo } from "@/lib/api";
import {
  hasModel,
  hasRound,
  type StateResponse,
  type Trade,
} from "@/lib/types";

const PLATE_BORDER = "#C7D8CB";
const ORANGE = "#E8641A";
const ORANGE_DEEP = "#B84A0C";
const Z = [0, 58, 128, 206];

const PLANES = [
  { id: 1, num: "01", title: "Market data" },
  { id: 2, num: "02", title: "Signal surface" },
  { id: 3, num: "03", title: "Agent policy" },
  { id: 4, num: "04", title: "Execution" },
] as const;

type PlaneId = (typeof PLANES)[number]["id"];

function lastTradeLabel(t: Trade | undefined): string {
  if (!t || typeof t.qty !== "number" || typeof t.fill_px !== "number")
    return "no fills yet";
  return `${t.side ?? "FILL"} ${t.qty.toFixed(2)} @ ${t.fill_px.toFixed(3)}`;
}

export default function PipelineIso({
  state,
  className,
}: {
  state: StateResponse | undefined;
  className?: string;
}) {
  const [picked, setPicked] = useState<PlaneId | null>(null);

  const model = state && hasModel(state.model) ? state.model : null;
  const stages = model?.stages;
  const round = state && hasRound(state.agents) ? state.agents : null;
  const trades = state?.trades ?? [];
  const lastTrade = trades[trades.length - 1];
  const now = state?.ts ?? Date.now() / 1000;

  // Active plane: trade in last 2 min → 04; analyst round in last 20s or one
  // starting within 5s → 03; graph refit in the last ~90s → 02; else 01.
  const active = useMemo<PlaneId>(() => {
    if (!state) return 1;
    if (typeof lastTrade?.ts === "number" && now - lastTrade.ts < 120) return 4;
    if (
      (round && now - round.round_ts < 20) ||
      state.sentinel.next_analyst_in_s < 5
    )
      return 3;
    const refits = state.timeline.filter((e) => e.type === "graph_refit");
    const lastRefit = refits[refits.length - 1];
    if (lastRefit && now - lastRefit.ts < 90) return 2;
    return 1;
  }, [state, lastTrade, round, now]);

  const shown = picked ?? active;

  const details: Record<
    PlaneId,
    { caption: string; rows: [string, string][] }
  > = {
    1: {
      caption: "Live venue feed — markets and fills flowing in.",
      rows: [
        ["Markets tracked", state ? String(state.markets.length) : "—"],
        [
          "Fills ingested",
          stages ? stages.n_fills.toLocaleString("en-US") : "—",
        ],
      ],
    },
    2: {
      caption: "Lead-lag graph after the null-model cull.",
      rows: [
        [
          "Edges surviving",
          stages
            ? `${stages.surviving_edges.toLocaleString("en-US")} / ${stages.candidate_edges.toLocaleString("en-US")}`
            : "—",
        ],
        [
          "Survival rate",
          stages ? `${(stages.survival_rate * 100).toFixed(1)}%` : "—",
        ],
        [
          "Influential wallets",
          stages ? stages.n_influential.toLocaleString("en-US") : "—",
        ],
      ],
    },
    3: {
      caption: "The supervisor's last arithmetic verdict.",
      rows: [
        [
          "Score",
          round
            ? `${round.supervisor.score >= 0 ? "+" : ""}${round.supervisor.score.toFixed(2)}`
            : "—",
        ],
        ["Action", round ? round.supervisor.action : "—"],
        [
          "Next round",
          state ? `in ${Math.max(0, Math.round(state.sentinel.next_analyst_in_s))}s` : "—",
        ],
      ],
    },
    4: {
      caption: "Paper fills placed by the supervisor.",
      rows: lastTrade
        ? [
            ["Last fill", lastTradeLabel(lastTrade)],
            [
              "When",
              typeof lastTrade.ts === "number"
                ? `${fmtAgo(now - lastTrade.ts)} ago`
                : "—",
            ],
            ["Session fills", String(trades.length)],
          ]
        : [["Last fill", "no fills yet"]],
    },
  };

  const shownPlane = PLANES.find((p) => p.id === shown)!;
  const shownDetail = details[shown];

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Live pipeline</CardTitle>
        <CardDescription>
          Four planes from venue data to fills. The lit plane is where the
          system is working right now — click one for its live numbers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-8 md:flex-row md:items-center">
          {/* Isometric stack */}
          <div className="relative h-[360px] w-[270px] shrink-0 select-none">
            <div className="absolute inset-x-0 bottom-2 flex justify-center [perspective:1200px] motion-safe:animate-[drift_7s_ease-in-out_infinite]">
              <div
                className="relative h-44 w-44"
                style={{
                  transform: "rotateX(58deg) rotateZ(-45deg)",
                  transformStyle: "preserve-3d",
                }}
              >
                {PLANES.map((plane, i) => {
                  const isActive = plane.id === active;
                  const isShown = plane.id === shown;
                  const algae = plane.id === 2;
                  return (
                    <button
                      key={plane.id}
                      type="button"
                      aria-pressed={isShown}
                      aria-label={`${plane.num} ${plane.title}`}
                      onClick={() =>
                        setPicked((p) => (p === plane.id ? null : plane.id))
                      }
                      className={cn(
                        "absolute inset-0 rounded-xl border p-2.5 text-left transition-all duration-300",
                        algae
                          ? "border-dashed bg-[#DCEBDF]"
                          : "bg-white",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      )}
                      style={{
                        transform: `translateZ(${Z[i] + (isActive ? 14 : 0)}px)`,
                        borderColor: isActive
                          ? ORANGE
                          : algae
                            ? "#8FBA9C"
                            : PLATE_BORDER,
                        boxShadow: isActive
                          ? "0 18px 32px rgba(232,100,26,0.18)"
                          : isShown
                            ? "0 10px 22px rgba(20,35,28,0.10)"
                            : "0 6px 16px rgba(20,35,28,0.06)",
                      }}
                    >
                      <span
                        className="text-[10px] font-bold tracking-[0.18em]"
                        style={{ color: isActive ? ORANGE_DEEP : "#5C7266" }}
                      >
                        {plane.num}
                      </span>

                      {/* Plate decoration per stage */}
                      {plane.id === 1 && (
                        <span className="absolute inset-x-3 bottom-3 flex items-end gap-1">
                          {[10, 18, 8, 22, 14, 26].map((h, j) => (
                            <span
                              key={j}
                              className="w-1.5 rounded-sm bg-[#8FBA9C]"
                              style={{ height: h }}
                            />
                          ))}
                        </span>
                      )}
                      {plane.id === 2 && (
                        <span className="absolute inset-3 top-7 grid grid-cols-4 gap-1">
                          {[0.5, 0.2, 0.35, 0.15, 0.25, 0.6, 0.3, 0.2, 0.15, 0.4, 0.55, 0.25].map(
                            (o, j) => (
                              <span
                                key={j}
                                className="rounded-[3px] bg-[#5E9673]"
                                style={{ opacity: o }}
                              />
                            )
                          )}
                        </span>
                      )}
                      {plane.id === 3 && (
                        <>
                          <span
                            className="pointer-events-none absolute inset-0 rounded-xl"
                            style={{
                              background:
                                "radial-gradient(circle at 50% 55%, rgba(232,100,26,0.28), transparent 62%)",
                            }}
                          />
                          <span
                            className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                            style={{ borderColor: "rgba(232,100,26,0.55)" }}
                          />
                        </>
                      )}
                      {plane.id === 4 && (
                        <span className="absolute inset-x-3 bottom-3">
                          <span
                            className="mb-1.5 block text-[9px] font-bold tracking-[0.14em]"
                            style={{ color: ORANGE_DEEP }}
                          >
                            {lastTrade?.side ?? "IDLE"}
                          </span>
                          <span className="block h-1 w-full rounded-full bg-[#EDF3EE]">
                            <span
                              className="block h-1 rounded-full"
                              style={{
                                width: lastTrade ? "72%" : "12%",
                                background: ORANGE,
                              }}
                            />
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Live numbers for the selected (or active) plane */}
          <div className="w-full min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span
                className="tnum text-xs font-bold tracking-[0.18em]"
                style={{
                  color: shown === active ? ORANGE_DEEP : "#5C7266",
                }}
              >
                {shownPlane.num}
              </span>
              <span className="text-sm font-semibold">{shownPlane.title}</span>
              {shown === active && (
                <span
                  className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: ORANGE_DEEP }}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: ORANGE }}
                  />
                  active
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {shownDetail.caption}
            </p>
            <dl className="mt-4 space-y-2.5">
              {shownDetail.rows.map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-4 border-b border-dashed pb-2 last:border-b-0"
                >
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="tnum truncate text-sm font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {shown === 4 && lastTrade?.question && (
              <p className="mt-3 truncate text-xs text-muted-foreground">
                {lastTrade.question}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
