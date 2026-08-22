"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity } from "lucide-react";
import { useSentinelState } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { href: "/", label: "The Desk" },
  { href: "/method", label: "How it works" },
];

export default function Header() {
  const pathname = usePathname();
  const { data: state, error } = useSentinelState();
  const online = !!state && !error;

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-card/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-8 px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-md bg-foreground text-background">
            <Activity className="size-4" />
          </span>
          <span className="text-base font-semibold tracking-tight">
            Lead-Lag Sentinel
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "text-[var(--agent)]" // active nav = agent voice (orange)
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1.5 tnum font-normal"
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                online ? "bg-[var(--up)]" : "bg-[var(--flat)]"
              )}
            />
            {online ? `${state?.mode} · cycle ${state?.cycle}` : "offline"}
          </Badge>
        </div>
      </div>
    </header>
  );
}
