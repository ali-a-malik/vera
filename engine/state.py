"""Writes the engine<->UI state contract to web/public/state.json each step."""

import json
import os
import tempfile
import threading

from engine.coverage_model import POINT_KEYS, POINT_NAMES

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_PATH = os.path.join(REPO_ROOT, "web", "public", "state.json")

_lock = threading.Lock()


def initial_state(dut="fifo_8x8", target=95, point_names=None):
    if point_names is None:
        point_names = [POINT_NAMES[k] for k in POINT_KEYS]
    return {
        "status": "idle",
        "dut": dut,
        "coverage_percent": 0,
        "target": target,
        "iteration": 0,
        "history": [{"iter": 0, "coverage": 0}],
        "points": [{"name": n, "hit": False} for n in point_names],
        "activity_log": [],
        "counts": {"tests_generated": 0, "bugs_found": 0,
                   "hours_saved_est": 0, "tokens_used": 0},
        "tests": [],
        "analysis": None,
        "bug": None,
        "memory": {"patterns_learned": 0},
    }


def write_state(state):
    """Atomic write so the UI never reads a half-written file."""
    with _lock:
        os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(STATE_PATH), suffix=".tmp")
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(state, f, indent=2)
            os.replace(tmp, STATE_PATH)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
