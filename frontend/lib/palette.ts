// Small semantic-color helper for the Quant Agent theme. The full theme lives
// in app/globals.css as shadcn CSS variables; these JS constants exist only for
// places that need a literal color (Recharts gradients/strokes).
// Algae green = structure/state. Sunrise orange = the agent's own voice ONLY.

export const COLORS = {
  agent: "#E8641A", // sunrise-500 — agent voice (chart line, fills, P&L)
  agentStrong: "#B84A0C", // sunrise-700
  up: "#5E9673", // algae-600 — positive / long_yes
  down: "#B84A0C", // sunrise-700 — negative / long_no (never pure red)
  flat: "#8A9C90", // ink-300
  algae: "#8FBA9C",
  algaeDeep: "#5E9673",
} as const;

export type Stance = "long_yes" | "long_no" | "flat";

export function stanceColor(stance: string): string {
  if (stance === "long_yes") return COLORS.up;
  if (stance === "long_no") return COLORS.down;
  return COLORS.flat;
}

export function stanceLabel(stance: string): string {
  if (stance === "long_yes") return "Long YES";
  if (stance === "long_no") return "Long NO";
  return "Flat";
}

/** shadcn Badge variant per stance (kept neutral; color applied via inline style). */
export function stanceBadgeVariant(
  stance: string
): "default" | "secondary" | "outline" {
  if (stance === "flat") return "outline";
  return "secondary";
}
