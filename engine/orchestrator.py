"""The agent loop: decide gap -> get stimulus -> run -> check -> measure -> repeat.

Stimulus sources, in order of preference per iteration:
  1. memory.json pattern that closed this point before (the flywheel)
  2. the AI generate agent (with run/retry)  — unless --no-ai
  3. a hand-written fallback seed so the loop never stalls

Run standalone:  python -m engine.orchestrator [--dut buggy] [--demo] [--no-ai]
Or driven by server.py in a background thread.
"""

import argparse
import time

from engine.coverage_model import CoverageModel, POINT_KEYS, POINT_NAMES
from engine.runner import run_stimulus
from engine.state import initial_state, write_state
from engine.stimulus import validate
from engine import strategy, triage

TARGET = 95
MAX_ITERS = 12

# fallback seeds keyed by coverage point — used for the pre-seeded first test
# and whenever the AI is unavailable or exhausts its retries
FALLBACK_SEEDS = {
    "read_until_empty":
        [{"op": "reset"}] + [{"op": "write", "val": 32 + i} for i in range(3)]
        + [{"op": "read"}] * 3,
    "simultaneous_read_write":
        [{"op": "reset"}, {"op": "write", "val": 10}]
        + [{"op": "write_read", "val": 20 + i} for i in range(3)]
        + [{"op": "read"}],
    "pointer_wraparound":
        [{"op": "reset"}, {"op": "write", "val": 1}, {"op": "write", "val": 2}]
        + [{"op": "write_read", "val": 64 + i} for i in range(8)]
        + [{"op": "read"}] * 2,
    "read_while_empty":
        [{"op": "reset"}, {"op": "read"}, {"op": "write", "val": 7}, {"op": "read"}],
    "wrote_until_full":
        [{"op": "reset"}] + [{"op": "write", "val": 16 + i} for i in range(8)],
    "write_while_full":
        [{"op": "reset"}] + [{"op": "write", "val": 16 + i} for i in range(8)]
        + [{"op": "write", "val": 99}],
}

HOURS_PER_TEST = 2     # rough manual-effort heuristic for the stats strip
HOURS_PER_BUG = 4


class Orchestrator:
    def __init__(self, dut="buggy", target=TARGET, max_iters=MAX_ITERS,
                 use_ai=True, demo=False, dut_name="fifo_8x8",
                 reuse_memory=False):
        self.dut = dut
        self.use_ai = use_ai
        self.demo = demo
        self.reuse_memory = reuse_memory  # the flywheel: replay patterns from past runs
        self.max_iters = max_iters
        self.cov = CoverageModel()
        self.mem = strategy.load_memory()
        self.state = initial_state(dut=dut_name, target=target)
        self.state["memory"]["patterns_learned"] = len(self.mem.get("patterns", {}))
        self._t0 = None
        self._stop = False
        write_state(self.state)

    # ---- plumbing ----------------------------------------------------

    def _ts(self):
        s = int(time.monotonic() - self._t0)
        return f"{s // 60:02d}:{s % 60:02d}"

    def log(self, level, text):
        print(f"[{level}] {text}", flush=True)
        self.state["activity_log"].append(
            {"t": self._ts(), "level": level, "text": text})
        self.state["activity_log"] = self.state["activity_log"][-60:]
        write_state(self.state)
        if self.demo:
            time.sleep(1.2)

    def _sync_coverage(self):
        self.state["coverage_percent"] = self.cov.percent()
        hits = self.cov.hits()
        self.state["points"] = [
            {"name": POINT_NAMES[k], "hit": hits[k]} for k in POINT_KEYS]

    def stop(self):
        self._stop = True

    # ---- stimulus sourcing --------------------------------------------

    def _get_stimulus(self, point, first_iter):
        """Returns (ops, source, result_or_None, tokens)."""
        pattern = strategy.known_pattern(self.mem, point) if self.reuse_memory else None
        if pattern is not None:
            self.log("info", f"memory hit — reusing pattern for {POINT_NAMES[point]}")
            return validate(pattern), "memory", None, 0

        if first_iter or not self.use_ai:
            return validate(FALLBACK_SEEDS[point]), "seed", None, 0

        from engine.agent_gen import generate_and_run
        gen = generate_and_run(self.cov.uncovered(), dut=self.dut, log=self.log)
        if gen["ok"]:
            return gen["ops"], "ai", gen["result"], gen["tokens"]

        self.log("warn", f"AI generation failed after {gen['attempts']} attempts — using fallback seed")
        return validate(FALLBACK_SEEDS[point]), "seed", None, gen["tokens"]

    # ---- bug path ------------------------------------------------------

    def _handle_failure(self, ops, mismatches):
        self.log("warn", "scoreboard mismatch — shrinking failure to minimal repro")
        bug = triage.triage(ops, mismatches, dut=self.dut, log=self.log)
        self.state["counts"]["tokens_used"] += bug.pop("tokens", 0)
        self.state["counts"]["bugs_found"] += 1
        mm = bug["mismatch"]
        fields = list(mm["expected"].keys())
        title = (f"{fields[0]} flag asserts one slot early"
                 if fields == ["full"] else bug["title"])
        self.state["bug"] = {
            "title": title,
            "severity": "functional",
            "minimal_repro": bug["minimal_repro"],
            "minimal_ops": bug["minimal_ops"],
            "expected": mm["expected"],
            "got": mm["got"],
            "hypothesis": bug["hypothesis"],
            "fix": bug.get("fix"),
        }
        self.log("err", f"bug — {title}")

    # ---- the loop --------------------------------------------------------

    def run(self):
        self._t0 = time.monotonic()
        self.state["status"] = "running"
        write_state(self.state)
        self.log("info", f"reading {self.state['dut']} interface — "
                         f"{len(POINT_KEYS)} coverage goals")

        for it in range(1, self.max_iters + 1):
            if self._stop or self.cov.percent() >= self.state["target"]:
                break
            self.state["iteration"] = it

            point = strategy.pick_target(self.cov.uncovered())
            if point is None:
                break
            self.log("info", f"agent — targeting {POINT_NAMES[point]}")

            ops, source, result, tokens = self._get_stimulus(point, first_iter=(it == 1))
            self.state["counts"]["tokens_used"] += tokens

            if result is None:
                out = run_stimulus(ops, dut=self.dut)
                if not out["ok"]:
                    self.log("warn", f"run error — {out['error'][:120]}")
                    continue
                result = out["result"]

            self.state["counts"]["tests_generated"] += 1
            before = self.cov.percent()
            before_hits = self.cov.hits()
            self.cov.merge(result["coverage_hits"])
            self._sync_coverage()
            self.state["history"].append({"iter": it, "coverage": self.cov.percent()})

            label = {"ai": "generated", "memory": "replayed", "seed": "seeded"}[source]
            self.log("ok", f"test #{self.state['counts']['tests_generated']} {label} — "
                           f"ran {result['cycles']} cycles — "
                           f"coverage {before}% -> {self.cov.percent()}%")

            # remember the pattern for every point this test newly closed
            for k, hit in result["coverage_hits"].items():
                if hit and not before_hits[k]:
                    strategy.remember(self.mem, k, ops)
            self.state["memory"]["patterns_learned"] = len(self.mem.get("patterns", {}))

            if result["mismatch_count"] and self.state["bug"] is None:
                self._handle_failure(ops, result["mismatches"])

            self.state["counts"]["hours_saved_est"] = (
                self.state["counts"]["tests_generated"] * HOURS_PER_TEST
                + self.state["counts"]["bugs_found"] * HOURS_PER_BUG)
            write_state(self.state)

        self.mem["runs"] = self.mem.get("runs", 0) + 1
        strategy.save_memory(self.mem)
        self.state["status"] = "done"
        hit, total = self.cov.num_hit(), len(POINT_KEYS)
        self.log("done", f"coverage target reached — {hit} / {total} corner cases"
                 if self.cov.percent() >= self.state["target"] else
                 f"stopped at {self.cov.percent()}% — {hit} / {total} corner cases")
        write_state(self.state)
        return self.state


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dut", default="buggy", choices=["good", "buggy"])
    p.add_argument("--demo", action="store_true", help="pace the run for presenting")
    p.add_argument("--no-ai", action="store_true", help="fallback seeds only")
    args = p.parse_args()
    orch = Orchestrator(dut=args.dut, use_ai=not args.no_ai, demo=args.demo)
    final = orch.run()
    print(f"\nfinal: {final['coverage_percent']}% — bug: "
          f"{final['bug']['title'] if final['bug'] else 'none'}")


if __name__ == "__main__":
    main()
