// Types matching the live Lead-Lag Sentinel FastAPI backend (verified via curl).

export interface SentinelInfo {
  uptime_s: number;
  rounds: number;
  acted: number;
  held: number;
  next_analyst_in_s: number;
  next_refit_in_s: number;
  last_checkpoint_ts: number | null;
  restored_from_checkpoint: boolean;
  downtime_s: number;
}

export interface Position {
  side?: string;
  qty?: number;
  entry_px?: number;
  [k: string]: unknown;
}

export interface Market {
  market_id: string;
  question: string;
  volume24hr: number;
  mid: number | null;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  flow_z: number;
  imbalance: number;
  whale_net_usd: number;
  detector: string; // "quiet" | "drift_up" | "drift_down" | ...
  position: Position | null;
}

export type Stance = "long_yes" | "long_no" | "flat";

export interface Analyst {
  name: string;
  stance: Stance;
  confidence: number; // 0..1
  rationale: string;
}

export interface Supervisor {
  score: number; // -1..1
  direction: string;
  action: string; // "TRADE" | "HOLD"
  reasons: string[];
  synthesis: string;
}

export interface AgentRound {
  round_ts: number;
  market_id: string;
  question: string;
  analysts: Analyst[];
  supervisor: Supervisor;
}

export interface Portfolio {
  cash: number;
  equity: number;
  realized: number;
  unrealized: number;
}

export interface PnlPoint {
  ts: number;
  equity: number;
}

// trades was [] on the live backend at inspection time; typed defensively.
export interface Trade {
  ts?: number;
  market_id?: string;
  question?: string;
  side?: string;
  qty?: number;
  fill_px?: number;
  pnl?: number | null;
  type?: string;
  [k: string]: unknown;
}

export interface TimelineEvent {
  ts: number;
  type: string; // boot | backfill | graph_refit | detector_trigger | heartbeat | analyst_round | hold | trade_open | trade_close | checkpoint_restored | ...
  market_id?: string;
  question?: string;
  kind?: string;
  stat?: number;
  cycle?: number;
  equity?: number;
  score?: number;
  reasons?: string[];
  synthesis?: string;
  votes?: Record<string, [string, number]>;
  n_fills?: number;
  n_wallets?: number;
  n_markets?: number;
  candidate_edges?: number;
  surviving_edges?: number;
  survival_rate?: number;
  null_draws?: number;
  n_influential?: number;
  bootstrap_B?: number;
  refit_s?: number;
  influential_delta?: number;
  mode?: string;
  [k: string]: unknown;
}

export interface Importance {
  feature: string;
  importance: number;
}

export interface Heatmap {
  fx: string;
  fy: string;
  x_bins: number[];
  y_bins: number[];
  z: number[][]; // rows = y, cols = x (12x12)
}

export interface ModelStages {
  n_fills: number;
  n_wallets: number;
  candidate_edges: number;
  surviving_edges: number;
  survival_rate: number;
  null_draws: number;
  n_influential: number;
  bootstrap_B: number;
  refit_s: number;
}

export interface ICStat {
  ic: number;
  p_value: number;
}

export interface Backtest {
  n_samples: number;
  ic_flow: ICStat | null;
  ic_imbalance: ICStat | null;
  flow_beats_baseline: boolean;
}

export interface ModelInfo {
  oob_r2?: number;
  network_share?: number;
  importances?: Importance[];
  heatmap?: Heatmap;
  stages?: ModelStages;
  backtest?: Backtest;
  max_ticket_usd?: number; // 50 = full size, 10 = probe
}

export interface StateResponse {
  ts: number;
  mode: string;
  cycle: number;
  sentinel: SentinelInfo;
  markets: Market[];
  agents: AgentRound | Record<string, never>;
  portfolio: Portfolio;
  pnl: PnlPoint[];
  trades: Trade[];
  timeline: TimelineEvent[];
  model: ModelInfo | Record<string, never>;
}

export interface Wallet {
  id: string;
  x: number;
  y: number;
  influence: number; // -1..1 normalized
  influential: boolean;
  notional: number;
}

export interface WalletsResponse {
  wallets: Wallet[];
}

export interface Edge {
  src: string;
  dst: string;
  w: number;
  n: number;
}

export interface EdgesResponse {
  edges: Edge[];
}

export interface TimelineResponse {
  events: TimelineEvent[];
}

export function hasRound(a: StateResponse["agents"]): a is AgentRound {
  return !!a && typeof (a as AgentRound).round_ts === "number";
}

export function hasModel(m: StateResponse["model"]): m is ModelInfo {
  return !!m && Object.keys(m).length > 0;
}
