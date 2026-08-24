"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
    // The site header is 4rem tall and sticky, so pin the fixed sidebar below it.
    <Sidebar collapsible="icon" className="top-16! h-auto!">
      <SidebarHeader className="px-4 pt-5 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-lg font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Analysts
          </div>
          <SidebarTrigger className="-mr-1 group-data-[collapsible=icon]:mx-auto" />
        </div>
        <p className="text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
          Three specialists, each watching one attribute of the focus market.
          Select one to drive the chart.
        </p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Agents</SidebarGroupLabel>
          <SidebarMenu className="gap-3 group-data-[collapsible=icon]:items-center">
            {AGENTS.map((agent) => {
              const a = analysts.find((x) => x.name === agent.key);
              const active = selected === agent.key;
              return (
                <SidebarMenuItem key={agent.key}>
                  {/* Collapsed: compact initials tile with stance dot */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onSelect(agent.key)}
                        aria-pressed={active}
                        aria-label={agent.label}
                        className={cn(
                          "relative mx-auto hidden size-9 place-items-center rounded-lg border bg-card text-[11px] font-bold transition-colors",
                          "group-data-[collapsible=icon]:grid",
                          "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "border-[var(--agent)] text-[var(--agent)] ring-1 ring-[var(--agent)]/40"
                            : "border-border text-foreground/80"
                        )}
                      >
                        {agent.initials}
                        <span
                          className="absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-sidebar"
                          style={{ background: stanceColor(a?.stance ?? "flat") }}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {agent.label}
                      {a ? ` · ${stanceLabel(a.stance)}` : ""}
                    </TooltipContent>
                  </Tooltip>

                  {/* Expanded: full card with rationale */}
                  <button
                    type="button"
                    onClick={() => onSelect(agent.key)}
                    aria-pressed={active}
                    className={cn(
                      "w-full rounded-lg border bg-card p-3 text-left transition-colors",
                      "group-data-[collapsible=icon]:hidden",
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
