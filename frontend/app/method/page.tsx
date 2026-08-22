"use client";

import { useSentinelState } from "@/lib/api";
import { hasModel } from "@/lib/types";
import { AGENTS } from "@/lib/desk";
import { COLORS } from "@/lib/palette";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

function IcChip({ label, ic, p }: { label: string; ic?: number; p?: number }) {
  const ok = ic != null && p != null;
  return (
    <div className="rounded-lg border px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="tnum mt-1 text-2xl font-semibold">
        {ok ? ic!.toFixed(3) : "—"}
      </div>
      <div className="tnum text-sm text-muted-foreground">
        {ok ? `p = ${p!.toFixed(3)}` : "warming up"}
      </div>
    </div>
  );
}

export default function MethodPage() {
  const { data: state } = useSentinelState();
  const model = state && hasModel(state.model) ? state.model : null;
  const bt = model?.backtest;
  const ticket = model?.max_ticket_usd;

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <header className="space-y-4">
        <Badge variant="secondary" className="font-medium">
          How it works
        </Badge>
        <h1 className="text-5xl font-semibold tracking-tight">
          A crew that reads order flow, and a supervisor that does the math.
        </h1>
        <p className="text-xl leading-relaxed text-muted-foreground">
          Lead-Lag Sentinel watches live Polymarket order flow, lets a small
          crew of specialist agents form opinions, and then lets a supervisor
          decide — by arithmetic, not by vibes. Everything here is a paper
          simulation. No real money moves.
        </p>
      </header>

      <Separator className="my-12" />

      <section className="space-y-6">
        <h2 className="text-3xl font-semibold tracking-tight">
          The analysts
        </h2>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Each analyst watches exactly one attribute of the market in focus and
          returns a stance — long YES, long NO, or flat — with a confidence.
          They read numbers, not headlines.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {AGENTS.map((a) => (
            <Card key={a.key}>
              <CardHeader>
                <CardTitle className="text-lg">{a.label}</CardTitle>
              </CardHeader>
              <CardContent className="text-base leading-relaxed text-muted-foreground">
                {a.attribute}.
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Two more quiet specialists — a momentum detector and a microstructure
          watcher — stand down unless their signal is unambiguous, which keeps
          the crew honest during calm markets.
        </p>
      </section>

      <Separator className="my-12" />

      <section className="space-y-6">
        <h2 className="text-3xl font-semibold tracking-tight">
          The supervisor decides by arithmetic
        </h2>
        <p className="text-lg leading-relaxed text-muted-foreground">
          The language models only <em>explain</em>. They never pull the
          trigger. Each analyst&apos;s stance and confidence become a signed
          vote; the supervisor weights those votes into a single score between
          −1 and +1. If the score clears a fixed threshold, it acts; otherwise
          it holds. The write-up you read on the desk is the agent narrating a
          decision the math already made — and a guard rejects any rationale
          that invents numbers.
        </p>
      </section>

      <Separator className="my-12" />

      <section className="space-y-6">
        <h2 className="text-3xl font-semibold tracking-tight">
          The honest backtest
        </h2>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Before sizing anything, the system asks a blunt question on a
          walk-forward basis: does this signal actually predict the next move?
          It measures the information coefficient (IC) — the correlation between
          the signal now and the price change later — on data the model
          has not yet traded on.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <IcChip
            label="IC · influence flow"
            ic={bt?.ic_flow?.ic}
            p={bt?.ic_flow?.p_value}
          />
          <IcChip
            label="IC · order-flow imbalance"
            ic={bt?.ic_imbalance?.ic}
            p={bt?.ic_imbalance?.p_value}
          />
        </div>
        <div className="rounded-lg border bg-muted/40 p-6">
          <h3 className="text-lg font-semibold">The sizing rule</h3>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            Deterministic, not discretionary. When the walk-forward IC is
            positive and statistically significant, a decision to trade gets a
            full-size ticket. When the evidence is weak, it only gets a probe.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-base">
            <span
              className="tnum rounded-md px-3 py-1.5 font-medium"
              style={{ background: COLORS.up + "22", color: COLORS.up }}
            >
              Signal proven → full size $50
            </span>
            <span
              className="tnum rounded-md px-3 py-1.5 font-medium text-muted-foreground"
              style={{ background: "var(--muted)" }}
            >
              Signal weak → probe $10
            </span>
            {ticket != null && (
              <Badge
                variant="outline"
                style={{ color: COLORS.agent, borderColor: COLORS.agent }}
                className="tnum"
              >
                live ticket: ${ticket}
              </Badge>
            )}
          </div>
        </div>
      </section>

      <Separator className="my-12" />

      <section className="space-y-6">
        <h2 className="text-3xl font-semibold tracking-tight">
          Built for the long horizon
        </h2>
        <p className="text-lg leading-relaxed text-muted-foreground">
          The sentinel is meant to run for days, not minutes. It refits its
          lead-lag graph on a schedule, checkpoints its state continuously, and
          restores cleanly after any interruption — so a restart never fabricates
          history or double-counts a position. Slow, deterministic, and auditable
          beats fast and mysterious.
        </p>
      </section>
    </div>
  );
}
