"""The oracle: a known-good Python reference FIFO.

Fed the same per-cycle operations as the DUT; after every cycle its outputs
are compared to the DUT's. Any mismatch means the DUT is wrong (or the test
harness is) — coverage never decides correctness, this does.
"""


class ReferenceFifo:
    def __init__(self, depth=8, width=8):
        self.depth = depth
        self.width = width
        self.reset()

    def reset(self):
        self.data = []
        self.dout = 0

    @property
    def count(self):
        return len(self.data)

    @property
    def full(self):
        return self.count == self.depth

    @property
    def empty(self):
        return self.count == 0

    def step(self, *, rst=False, wr_en=False, rd_en=False, din=0):
        """Advance one clock cycle. Returns expected post-edge outputs."""
        if rst:
            self.reset()
        else:
            do_write = wr_en and not self.full
            do_read = rd_en and not self.empty
            if do_read:
                self.dout = self.data[0]
            if do_write:
                self.data.append(din & ((1 << self.width) - 1))
            if do_read:
                self.data.pop(0)
        return self.outputs()

    def outputs(self):
        return {
            "dout": self.dout,
            "full": self.full,
            "empty": self.empty,
            "count": self.count,
        }


class ReferenceArbiter:
    """Known-good 2-requester round-robin arbiter (mirrors rtl/arbiter.v)."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.gnt0 = False
        self.gnt1 = False
        self.last = 1  # first contested grant goes to req0

    def step(self, *, rst=False, req0=False, req1=False, **_):
        if rst:
            self.reset()
        else:
            self.gnt0 = self.gnt1 = False
            if req0 and not req1:
                self.gnt0 = True
            elif req1 and not req0:
                self.gnt1 = True
            elif req0 and req1:
                if self.last:
                    self.gnt0, self.last = True, 0
                else:
                    self.gnt1, self.last = True, 1
        return self.outputs()

    def outputs(self):
        return {"gnt0": self.gnt0, "gnt1": self.gnt1}


def compare(expected, got):
    """Return dict of mismatching fields ({field: (expected, got)}) or {}."""
    diffs = {}
    for k, v in expected.items():
        if got.get(k) != v:
            diffs[k] = (v, got.get(k))
    return diffs
