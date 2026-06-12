"""Agent 3 — Strategy: pick the most valuable uncovered point; consult memory.

memory.json: {"patterns": {"<design>:<point_key>": [ops...]}, "runs": N}
A pattern is the stimulus that closed that point. Patterns are namespaced by
design; cross-design reuse goes through library() — the stimulus *shapes*
(fill, drain, both-at-once, alternate) transfer because all designs share
the same op vocabulary.
"""

import json
import os

MEMORY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "memory.json")


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


def pick_target(uncovered, priority):
    """Highest-priority uncovered point."""
    for key in priority:
        if key in uncovered:
            return key
    return uncovered[0] if uncovered else None


def known_pattern(mem, design, point_key):
    return mem.get("patterns", {}).get(f"{design}:{point_key}")


def remember(mem, design, point_key, ops):
    mem.setdefault("patterns", {})[f"{design}:{point_key}"] = ops
    save_memory(mem)


def library(mem, exclude_design=None, cap=5):
    """Unique patterns learned on OTHER designs — the cross-design flywheel.

    Returns [(source_design, point_key, ops), ...], deduped by ops, capped.
    """
    out, seen = [], set()
    for key, ops in mem.get("patterns", {}).items():
        design, _, point = key.partition(":")
        if design == exclude_design:
            continue
        sig = json.dumps(ops, sort_keys=True)
        if sig in seen:
            continue
        seen.add(sig)
        out.append((design, point, ops))
        if len(out) >= cap:
            break
    return out
