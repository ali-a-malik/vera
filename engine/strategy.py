"""Agent 3 — Strategy: pick the most valuable uncovered point; consult memory.

memory.json: {"patterns": {"<point_key>": [ops...]}, "runs": N}
A pattern is the stimulus that closed that point on a previous design/run.
"""

import json
import os

MEMORY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "memory.json")

# cheap-to-deep ordering: easy structural cases first, boundary probes
# (fill-to-full, overflow) last — those are worth most once basics are closed
PRIORITY = [
    "read_until_empty",
    "simultaneous_read_write",
    "pointer_wraparound",
    "read_while_empty",
    "wrote_until_full",
    "write_while_full",
]


def load_memory():
    if os.path.exists(MEMORY_PATH):
        try:
            with open(MEMORY_PATH) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return {"patterns": {}, "runs": 0}


def save_memory(mem):
    with open(MEMORY_PATH, "w") as f:
        json.dump(mem, f, indent=2)


def pick_target(uncovered):
    """Highest-priority uncovered point."""
    for key in PRIORITY:
        if key in uncovered:
            return key
    return uncovered[0] if uncovered else None


def known_pattern(mem, point_key):
    return mem.get("patterns", {}).get(point_key)


def remember(mem, point_key, ops):
    mem.setdefault("patterns", {})[point_key] = ops
    save_memory(mem)
