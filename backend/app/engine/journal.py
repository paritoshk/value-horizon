"""Append-only typed event journal — the long-horizon record.

Every decision, including correct inaction (HOLD), is journaled. The journal
is the demo: uptime, holds vs acts, triggers, refits, checkpoint-resumes.
"""

import json
import os
import time
import threading

_LOCK = threading.Lock()


class Journal:
    def __init__(self, path: str):
        self.path = path
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.tail: list[dict] = []
        if os.path.exists(path):
            with open(path) as fh:
                for line in fh:
                    try:
                        self.tail.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
        self.tail = self.tail[-500:]

    def append(self, type_: str, **fields) -> dict:
        event = {"ts": round(time.time(), 3), "type": type_, **fields}
        with _LOCK:
            with open(self.path, "a") as fh:
                fh.write(json.dumps(event, default=str) + "\n")
            self.tail = (self.tail + [event])[-500:]
        return event

    def journaled_buy_notional(self) -> float:
        total = 0.0
        if os.path.exists(self.path):
            with open(self.path) as fh:
                for line in fh:
                    try:
                        e = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if e.get("type") == "trade_open":
                        total += e.get("qty", 0) * e.get("fill_px", 0)
        return total

    def counts(self) -> dict:
        c = {"rounds": 0, "acted": 0, "held": 0}
        for e in self.tail:
            if e["type"] == "analyst_round":
                c["rounds"] += 1
            elif e["type"] in ("trade_open", "trade_close"):
                c["acted"] += 1
            elif e["type"] == "hold":
                c["held"] += 1
        return c
