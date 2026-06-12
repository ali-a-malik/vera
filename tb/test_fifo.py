"""Data-driven cocotb runner.

Reads a stimulus op-list (JSON) from $STIMULUS_FILE, drives the DUT one op
per cycle, runs the known-good reference checker every cycle, marks
coverage, and writes results (coverage hits + mismatches) to $RESULT_FILE.

With no STIMULUS_FILE set, runs a built-in smoke stimulus.
"""

import json
import os

import cocotb
from cocotb.clock import Clock
from cocotb.triggers import FallingEdge

from engine.checker import ReferenceFifo, compare
from engine.coverage_model import CoverageModel, CoverageTracker
from engine.stimulus import validate, to_signals

DEPTH = 8

# built-in smoke stimulus: write 3, read 3 (hits read_until_empty)
DEFAULT_OPS = (
    [{"op": "reset"}]
    + [{"op": "write", "val": v} for v in (0xA3, 0x5C, 0x11)]
    + [{"op": "read"}] * 4
    + [{"op": "write_read", "val": 0x77}]
    + [{"op": "idle"}]
)

MAX_MISMATCHES = 20


def drive(dut, sig):
    dut.rst.value = 1 if sig["rst"] else 0
    dut.wr_en.value = 1 if sig["wr_en"] else 0
    dut.rd_en.value = 1 if sig["rd_en"] else 0
    dut.din.value = sig["din"]


def sample(dut):
    return {
        "dout": int(dut.dout.value),
        "full": bool(dut.full.value),
        "empty": bool(dut.empty.value),
        "count": int(dut.count.value),
    }


@cocotb.test()
async def run_stimulus(dut):
    """Drive the op list, check every cycle against the reference model."""
    stim_path = os.environ.get("STIMULUS_FILE", "")
    if stim_path:
        with open(stim_path) as f:
            ops = validate(json.load(f))
    else:
        ops = validate(DEFAULT_OPS)

    cocotb.start_soon(Clock(dut.clk, 10, units="ns").start())

    # force a clean start regardless of stimulus content
    drive(dut, {"rst": True, "wr_en": False, "rd_en": False, "din": 0})
    await FallingEdge(dut.clk)
    await FallingEdge(dut.clk)

    ref = ReferenceFifo(depth=DEPTH)
    cov = CoverageModel()
    tracker = CoverageTracker(cov, depth=DEPTH)
    mismatches = []

    for i, op in enumerate(ops):
        sig = to_signals(op)
        pre_full, pre_empty = ref.full, ref.empty
        drive(dut, sig)
        await FallingEdge(dut.clk)  # crosses one rising edge

        expected = ref.step(rst=sig["rst"], wr_en=sig["wr_en"],
                            rd_en=sig["rd_en"], din=sig["din"])
        got = sample(dut)
        diffs = compare(expected, got)
        if diffs and len(mismatches) < MAX_MISMATCHES:
            mismatches.append({
                "cycle": i,
                "op": op,
                "expected": {k: v[0] for k, v in diffs.items()},
                "got": {k: v[1] for k, v in diffs.items()},
            })

        tracker.observe(wr_en=sig["wr_en"], rd_en=sig["rd_en"],
                        full=pre_full, empty=pre_empty,
                        count_after=ref.count)

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

    # mismatches are *reported*, not asserted — the orchestrator decides
    # what to do with failures (triage, shrink, root-cause)
