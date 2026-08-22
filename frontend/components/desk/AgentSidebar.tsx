"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AGENTS, type AgentKey } from "@/lib/desk";
import { stanceColor, stanceLabel } from "@/lib/palette";
import type { Analyst } from "@/lib/types";

function StanceBadge({ stance }: { stance: string }) {
  const color = stanceColor(stance);
  return (
    <Badge
      variant="outline"
      className="gap-1.5 font-medium"
      style={{ color, borderColor: color }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: color }}
      />
      {stanceLabel(stance)}
    </Badge>
  );
}

export default function AgentSidebar({
  analysts,
  selected,
  onSelect,
  warming,
}: {
  analysts: Analyst[];
  selected: AgentKey;
  onSelect: (k: AgentKey) => void;
  warming: boolean;
}) {
  return (
    <Sidebar collapsible="none" className="h-auto border-r bg-card">
      <SidebarHeader className="px-4 pt-5">
        <div className="text-lg font-semibold tracking-tight">Analysts</div>
        <p className="text-sm text-muted-foreground">
          Three specialists, each watching one attribute of the focus market.
          Select one to drive the chart.
        </p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Agents</SidebarGroupLabel>
          <SidebarMenu className="gap-3">
            {AGENTS.map((agent) => {
              const a = analysts.find((x) => x.name === agent.key);
              const active = selected === agent.key;
              return (
                <SidebarMenuItem key={agent.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(agent.key)}
                    aria-pressed={active}
                    className={cn(
                      "w-full rounded-lg border bg-card p-3 text-left transition-colors",
                      "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-[var(--agent)] ring-1 ring-[var(--agent)]/40"
                        : "border-border"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div
                          className={cn(
                            "truncate text-sm font-semibold",
                            active && "text-[var(--agent)]"
                          )}
                        >
                          {agent.label}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {agent.attribute}
                        </div>
                      </div>
                      {a && <StanceBadge stance={a.stance} />}
                    </div>

                    {warming || !a ? (
                      <div className="mt-3 space-y-2">
                        <Skeleton className="h-2 w-full" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-4/5" />
                      </div>
                    ) : (
                      <>
                        <div className="mt-3 flex items-center gap-2">
                          <Progress
                            value={Math.round(a.confidence * 100)}
                            className="h-1.5"
                          />
                          <span className="tnum shrink-0 text-xs text-muted-foreground">
                            {(a.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="mt-3 rounded-md bg-muted/50 p-2.5">
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            What I&apos;m doing
                          </div>
                          <p className="text-xs leading-relaxed text-foreground/80">
                            {a.rationale}
                          </p>
                        </div>
                      </>
                    )}
                  </button>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
