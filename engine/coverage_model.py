"""Hand-rolled coverage model: 6 FIFO corner cases.

Coverage tracks what was *exercised*; the checker (checker.py) decides
*correctness*. Keep them separate.
"""

POINT_KEYS = [
    "wrote_until_full",
    "read_until_empty",
    "simultaneous_read_write",
    "pointer_wraparound",
    "write_while_full",
    "read_while_empty",
]

# display names for the UI / state.json
POINT_NAMES = {
    "wrote_until_full": "wrote until full",
    "read_until_empty": "read until empty",
    "simultaneous_read_write": "simultaneous read + write",
    "pointer_wraparound": "pointer wrap-around",
    "write_while_full": "write while full",
    "read_while_empty": "read while empty",
}


class CoverageModel:
    def __init__(self):
        self._hits = {k: False for k in POINT_KEYS}

    def reset(self):
        self._hits = {k: False for k in POINT_KEYS}

    def mark(self, key):
        if key not in self._hits:
            raise KeyError(f"unknown coverage point: {key}")
        self._hits[key] = True

    def merge(self, other_hits):
        """Fold in hits from another run (dict key -> bool)."""
        for k, v in other_hits.items():
            if v and k in self._hits:
                self._hits[k] = True

    def hits(self):
        return dict(self._hits)

    def uncovered(self):
        return [k for k, v in self._hits.items() if not v]

    def num_hit(self):
        return sum(self._hits.values())

    def percent(self):
        return round(100 * self.num_hit() / len(POINT_KEYS))

    def summary(self):
        return f"{self.num_hit()}/{len(POINT_KEYS)} — {self.percent()}%"


class CoverageTracker:
    """Watches per-cycle FIFO activity and marks coverage points.

    Call observe() once per cycle with the state *before* the clock edge
    (the inputs applied and the flags they saw).
    """

    def __init__(self, model, depth=8):
        self.model = model
        self.depth = depth
        self._was_nonempty = False
        self._writes_total = 0
        self._reads_total = 0

    def observe(self, *, wr_en, rd_en, full, empty, count_after):
        m = self.model
        if wr_en and rd_en:
            m.mark("simultaneous_read_write")
        if wr_en and full:
            m.mark("write_while_full")
        if rd_en and empty:
            m.mark("read_while_empty")
        if count_after >= self.depth:
            m.mark("wrote_until_full")
        if self._was_nonempty and count_after == 0:
            m.mark("read_until_empty")
        if count_after > 0:
            self._was_nonempty = True

        # pointer wraparound: a pointer passes DEPTH-1 back to 0 after
        # DEPTH successful operations of that kind
        if wr_en and not full:
            self._writes_total += 1
            if self._writes_total % self.depth == 0:
                m.mark("pointer_wraparound")
        if rd_en and not empty:
            self._reads_total += 1
            if self._reads_total % self.depth == 0:
                m.mark("pointer_wraparound")
