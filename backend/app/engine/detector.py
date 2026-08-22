"""Structural-change detection on a live price stream. Pure logic: no I/O.

Process-control style, per monitored market. The high-pass filter is the
first difference d_t = p_t - p_{t-1} (innovations): for a wandering market
price the innovations are ~independent, so control-chart statistics behave —
whereas residuals against a slow moving average are autocorrelated and
false-fire on ordinary drift.

  1. d_t = p_t - p_{t-1}                      — high-pass signal
  2. v   = EWMA of d^2                        — the market's noise floor
  3. variance burst: mean(d^2, short window) / v >= R
  4. CUSUM on z = d/sqrt(v)                   — sustained one-way repricing
  5. EWMA level m is kept only as the reported "baseline" price.

State is plain floats/lists so it round-trips through to_dict()/from_dict()
for checkpointing.
"""

from dataclasses import dataclass, field


@dataclass
class StreamConfig:
    alpha_slow: float = 0.02
    alpha_var: float = 0.01
    var_floor: float = 0.002 ** 2
    k_window: int = 12
    var_ratio_r: float = 9.0
    cusum_k: float = 0.5
    cusum_h: float = 8.0
    warmup_n: int = 60
    cooldown_s: float = 600.0
    realert_delta: float = 0.02
    window_keep: int = 120


@dataclass
class PriceTick:
    market_id: str
    ts: float
    prob: float


@dataclass
class Trigger:
    market_id: str
    kind: str
    ts: float
    prob_now: float
    prob_baseline: float
    stat: float
    window_s: float
    window_probs: list[float]


@dataclass
class DetectorState:
    prev_p: float | None = None
    m: float | None = None
    v: float = 0.0
    diff_sq: list[float] = field(default_factory=list)
    s_pos: float = 0.0
    s_neg: float = 0.0
    n: int = 0
    last_ts: float = 0.0
    last_alert_ts: float = 0.0
    last_alert_p: float | None = None
    window: list[float] = field(default_factory=list)
    window_ts: list[float] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "prev_p": self.prev_p, "m": self.m, "v": self.v,
            "diff_sq": list(self.diff_sq), "s_pos": self.s_pos,
            "s_neg": self.s_neg, "n": self.n, "last_ts": self.last_ts,
            "last_alert_ts": self.last_alert_ts, "last_alert_p": self.last_alert_p,
            "window": list(self.window), "window_ts": list(self.window_ts),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "DetectorState":
        return cls(**d)


def update(state: DetectorState, tick: PriceTick, cfg: StreamConfig) -> Trigger | None:
    """Consume one tick, mutate state, return a Trigger if one fires."""
    p, ts = tick.prob, tick.ts
    state.n += 1
    state.last_ts = ts
    state.window = (state.window + [p])[-cfg.window_keep:]
    state.window_ts = (state.window_ts + [ts])[-cfg.window_keep:]

    if state.prev_p is None:
        state.prev_p, state.m, state.v = p, p, cfg.var_floor
        return None

    d = p - state.prev_p
    state.prev_p = p
    baseline = state.m
    state.m += cfg.alpha_slow * (p - state.m)

    # CUSUM standardizes against the noise floor *before* this innovation is
    # folded in, so a genuine shock is measured against calm-period noise.
    z = d / (state.v ** 0.5)
    state.s_pos = max(0.0, state.s_pos + z - cfg.cusum_k)
    state.s_neg = max(0.0, state.s_neg - z - cfg.cusum_k)

    state.diff_sq = (state.diff_sq + [d * d])[-cfg.k_window:]
    short_var = sum(state.diff_sq) / len(state.diff_sq)
    var_ratio = short_var / state.v

    state.v = max(
        (1 - cfg.alpha_var) * state.v + cfg.alpha_var * d * d, cfg.var_floor
    )

    if state.n < cfg.warmup_n:
        return None

    cooled = ts - state.last_alert_ts > cfg.cooldown_s
    moved = (
        state.last_alert_p is None
        or abs(p - state.last_alert_p) >= cfg.realert_delta
    )
    if not (cooled and moved):
        return None

    kind = None
    stat = 0.0
    if state.s_pos > cfg.cusum_h or state.s_neg > cfg.cusum_h:
        kind = "drift_up" if state.s_pos >= state.s_neg else "drift_down"
        stat = max(state.s_pos, state.s_neg)
    elif len(state.diff_sq) == cfg.k_window and var_ratio >= cfg.var_ratio_r:
        kind = "variance_burst"
        stat = var_ratio
    if kind is None:
        return None

    state.s_pos = state.s_neg = 0.0
    state.diff_sq = []
    state.last_alert_ts = ts
    state.last_alert_p = p
    window_s = ts - state.window_ts[0] if state.window_ts else 0.0

    return Trigger(
        market_id=tick.market_id,
        kind=kind,
        ts=ts,
        prob_now=p,
        prob_baseline=min(1.0, max(0.0, baseline)),
        stat=round(stat, 3),
        window_s=window_s,
        window_probs=[round(x, 4) for x in state.window],
    )
