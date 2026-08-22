"""In-memory world state + atomic JSON checkpointing.

Everything the sentinel accumulates that must survive a crash goes through
to_checkpoint()/restore(): the paper ledger, detector states, cycle counters,
and the fills buffer high-water mark. The fills themselves are re-backfilled
live on boot (they are public history; refetching is cheaper than persisting).
"""

import json
import os
import time

import pandas as pd

from . import config
from .engine.detector import DetectorState
from .engine.paper import PaperEngine


class AppState:
    def __init__(self):
        self.boot_ts = time.time()
        self.cycle = 0
        self.mode = "live"
        self.universe: list[dict] = []           # discover() output
        self.fills = pd.DataFrame()              # normalized fills buffer
        self.fills_at_last_refit = 0
        self.books: dict[str, dict] = {}         # token_id -> {bid, ask}
        self.prices: dict[str, pd.Series] = {}   # token_id -> mid series
        self.detectors: dict[str, DetectorState] = {}
        self.detector_status: dict[str, str] = {}
        self.paper = PaperEngine(cash=config.BUDGET_USD, start_equity=config.BUDGET_USD)
        self.trigger: dict | None = None
        self.poke = False
        # model artifacts (set by refit)
        self.model: dict = {}        # oob_r2, network_share, importances, heatmap, stage numbers
        self.influential: set[str] = set()
        self.wallet_cloud: list[dict] = []
        self.edge_list: list[dict] = []
        self.signals: dict[str, dict] = {}       # market_id -> signal blocks
        self.last_round: dict = {}
        self.next_analyst_ts = 0.0
        self.next_refit_ts = 0.0
        self.last_checkpoint_ts = 0.0
        self.restored_from_checkpoint = False
        self.downtime_s = 0.0

    # ---------------- checkpoint ----------------
    def to_checkpoint(self) -> dict:
        return {
            "saved_ts": time.time(),
            "boot_ts": self.boot_ts,
            "cycle": self.cycle,
            "paper": self.paper.to_dict(),
            "detectors": {k: v.to_dict() for k, v in self.detectors.items()},
            "next_analyst_ts": self.next_analyst_ts,
            "next_refit_ts": self.next_refit_ts,
        }

    def save_checkpoint(self):
        path = config.CHECKPOINT_PATH
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w") as fh:
            json.dump(self.to_checkpoint(), fh, default=str)
        os.replace(tmp, path)
        self.last_checkpoint_ts = time.time()

    def restore(self) -> bool:
        path = config.CHECKPOINT_PATH
        if not os.path.exists(path):
            return False
        try:
            with open(path) as fh:
                d = json.load(fh)
            self.paper = PaperEngine.from_dict(d["paper"])
            self.detectors = {k: DetectorState.from_dict(v)
                              for k, v in d.get("detectors", {}).items()}
            self.cycle = d.get("cycle", 0)
            self.downtime_s = max(0.0, time.time() - d.get("saved_ts", time.time()))
            self.restored_from_checkpoint = True
            return True
        except Exception:
            return False
