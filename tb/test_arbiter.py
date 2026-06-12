"""Data-driven cocotb runner for the round-robin arbiter.

Same stimulus contract as the FIFO runner — the shared op vocabulary maps to
this design's inputs:  write -> req0, read -> req1, write_read -> contention,
idle -> no requests, reset -> rst.  "val" is ignored.
"""

import json
import os

import cocotb
from cocotb.clock import Clock
from cocotb.triggers import FallingEdge

from engine.checker import ReferenceArbiter, compare
from engine.coverage_model import ArbiterCoverageTracker, CoverageModel
from engine.designs import get as get_design
from engine.stimulus import validate, to_signals

DEFAULT_OPS = (
    [{"op": "reset"}, {"op": "write", "val": 1}, {"op": "read"},
     {"op": "write_read", "val": 1}, {"op": "write_read", "val": 1},
     {"op": "idle"}, {"op": "write", "val": 1}]
)

MAX_MISMATCHES = 20


def drive(dut, sig):
    dut.rst.value = 1 if sig["rst"] else 0
    dut.req0.value = 1 if sig["wr_en"] else 0
    dut.req1.value = 1 if sig["rd_en"] else 0


def sample(dut):
    return {"gnt0": bool(dut.gnt0.value), "gnt1": bool(dut.gnt1.value)}


@cocotb.test()
async def run_stimulus(dut):
    """Drive the op list, check every cycle against the reference arbiter."""
    stim_path = os.environ.get("STIMULUS_FILE", "")
    if stim_path:
        with open(stim_path) as f:
            ops = validate(json.load(f))
    else:
        ops = validate(DEFAULT_OPS)

    cocotb.start_soon(Clock(dut.clk, 10, units="ns").start())

    drive(dut, {"rst": True, "wr_en": False, "rd_en": False, "din": 0})
    await FallingEdge(dut.clk)
    await FallingEdge(dut.clk)

    ref = ReferenceArbiter()
    cov = CoverageModel(points=get_design("rr_arbiter")["points"])
    tracker = ArbiterCoverageTracker(cov)
    mismatches = []

    for i, op in enumerate(ops):
        sig = to_signals(op)
        drive(dut, sig)
        await FallingEdge(dut.clk)  # crosses one rising edge

        expected = ref.step(rst=sig["rst"], req0=sig["wr_en"], req1=sig["rd_en"])
        got = sample(dut)
        diffs = compare(expected, got)
        if diffs and len(mismatches) < MAX_MISMATCHES:
            mismatches.append({
                "cycle": i,
                "op": op,
                "expected": {k: v[0] for k, v in diffs.items()},
                "got": {k: v[1] for k, v in diffs.items()},
            })

        tracker.observe(req0=sig["wr_en"], req1=sig["rd_en"],
                        gnt0_after=got["gnt0"], gnt1_after=got["gnt1"],
                        in_reset=sig["rst"])

    result = {
        "cycles": len(ops),
        "coverage_hits": cov.hits(),
        "coverage_percent": cov.percent(),
        "mismatch_count": len(mismatches),
        "mismatches": mismatches,
    }
    out_path = os.environ.get("RESULT_FILE", "")
    if out_path:
        with open(out_path, "w") as f:
            json.dump(result, f, indent=2)

    dut._log.info("COVERAGE %s", cov.summary())
    for m in mismatches:
        dut._log.warning("MISMATCH cycle=%d op=%s expected=%s got=%s",
                         m["cycle"], m["op"], m["expected"], m["got"])
