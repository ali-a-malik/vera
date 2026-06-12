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
    def __init__(self, points=None):
        self.points = list(points) if points else list(POINT_KEYS)
        self._hits = {k: False for k in self.points}

    def reset(self):
        self._hits = {k: False for k in self.points}

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
        return round(100 * self.num_hit() / len(self.points))

    def summary(self):
        return f"{self.num_hit()}/{len(self.points)} — {self.percent()}%"


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


class ArbiterCoverageTracker:
    """Marks the rr_arbiter coverage points from per-cycle activity.

    Call observe() once per cycle with the requests driven that cycle and
    the grants sampled after the clock edge.
    """

    def __init__(self, model):
        self.model = model
        self._prev_contention = False
        self._prev_gnt = None      # 0 / 1 / None — winner of previous cycle
        self._prev_idle = False
        self._saw_request = False

    def observe(self, *, req0, req1, gnt0_after, gnt1_after, in_reset=False):
        if in_reset:
            self._prev_contention = False
            self._prev_gnt = None
            self._prev_idle = False
            return
        m = self.model
        gnt = 0 if gnt0_after else 1 if gnt1_after else None

        if req0 and not req1 and gnt == 0:
            m.mark("solo_req0_granted")
        if req1 and not req0 and gnt == 1:
            m.mark("solo_req1_granted")
        if req0 and req1:
            m.mark("contention")
            if self._prev_contention and self._prev_gnt is not None \
                    and gnt is not None and gnt != self._prev_gnt:
                m.mark("rr_alternation")
        if not req0 and not req1:
            m.mark("idle_cycle")
        if self._prev_idle and (req0 or req1) and gnt is not None:
            m.mark("grant_after_idle")

        self._prev_contention = req0 and req1
        self._prev_gnt = gnt
        self._prev_idle = not req0 and not req1
