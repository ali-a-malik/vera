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


def compare(expected, got):
    """Return dict of mismatching fields ({field: (expected, got)}) or {}."""
    diffs = {}
    for k, v in expected.items():
        if got.get(k) != v:
            diffs[k] = (v, got.get(k))
    return diffs
