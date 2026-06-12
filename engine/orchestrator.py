"""The agent loop: decide gap -> get stimulus -> run -> check -> measure -> repeat.

Stimulus sources, in order of preference per iteration:
  1. memory.json pattern that closed this point before (the flywheel);
     on a fresh design, patterns learned on OTHER designs are warm-start
     candidates — the shared op vocabulary makes them replayable
  2. the AI generate agent (with run/retry)  — unless --no-ai
  3. a hand-written fallback seed so the loop never stalls

Run standalone:  python -m engine.orchestrator [--design rr_arbiter] [--dut buggy]
                                               [--demo] [--no-ai] [--reuse-memory]
Or driven by server.py in a background thread.
"""

import argparse
import time

from engine.coverage_model import CoverageModel
from engine.runner import run_stimulus
from engine.state import initial_state, write_state
from engine.stimulus import validate
from engine import designs, explain, strategy, triage

TARGET = 95
MAX_ITERS = 12

HOURS_PER_TEST = 2     # rough manual-effort heuristic for the stats strip
HOURS_PER_BUG = 4


class Orchestrator:
    def __init__(self, design="fifo_8x8", dut="buggy", target=TARGET,
                 max_iters=MAX_ITERS, use_ai=True, demo=False,
                 reuse_memory=False):
        self.design = design
        self.cfg = designs.get(design)
        self.dut = dut if "buggy" in self.cfg["rtl"] else "good"
        self.use_ai = use_ai
        self.demo = demo
        self.reuse_memory = reuse_memory  # the flywheel: replay patterns from past runs
        self.max_iters = max_iters
        self.cov = CoverageModel(points=self.cfg["points"])
        self.mem = strategy.load_memory()
        self.state = initial_state(
            dut=design, target=target,
            point_names=[self.cfg["point_names"][k] for k in self.cfg["points"]])
        self.state["memory"]["patterns_learned"] = len(self.mem.get("patterns", {}))
        # cross-design warm-start queue (consumed before AI on a fresh design)
        self._warm = (strategy.library(self.mem, exclude_design=design)
                      if reuse_memory else [])
        self._t0 = None
        self._stop = False
        write_state(self.state)

    # ---- plumbing ----------------------------------------------------

    def _ts(self):
        s = int(time.monotonic() - self._t0)
        return f"{s // 60:02d}:{s % 60:02d}"

    def log(self, level, text, test_id=None):
        print(f"[{level}] {text}", flush=True)
        entry = {"t": self._ts(), "level": level, "text": text}
        if test_id is not None:
            entry["test"] = test_id  # lets the UI link this line to a test record
        self.state["activity_log"].append(entry)
        self.state["activity_log"] = self.state["activity_log"][-60:]
        write_state(self.state)
        if self.demo:
            time.sleep(1.2)

    def _name(self, point):
        return self.cfg["point_names"][point]

    def _sync_coverage(self):
        self.state["coverage_percent"] = self.cov.percent()
        hits = self.cov.hits()
        self.state["points"] = [
            {"name": self._name(k), "hit": hits[k]} for k in self.cfg["points"]]

    def _count_reuse(self):
        self.state["memory"]["patterns_reused"] = (
            self.state["memory"].get("patterns_reused", 0) + 1)

    def stop(self):
        self._stop = True

    # ---- stimulus sourcing --------------------------------------------

    def _get_stimulus(self, point, first_iter):
        """Returns (ops, source, result_or_None, tokens)."""
        # 1a. exact pattern from a previous run of THIS design
        pattern = (strategy.known_pattern(self.mem, self.design, point)
                   if self.reuse_memory else None)
        if pattern is not None:
            self.log("info", f"memory hit — reusing pattern for {self._name(point)}")
            self._count_reuse()
            return validate(pattern), "memory", None, 0

        # 1b. warm-start: replay a pattern learned on another design
        if self._warm:
            src_design, src_point, ops = self._warm.pop(0)
            self.log("info", f"memory — replaying pattern from {src_design} "
                             f"(closed {src_point} there)")
            self._count_reuse()
            self._warm_replay = True
            return validate(ops), "memory", None, 0
        self._warm_replay = False

        if first_iter or not self.use_ai:
            return validate(self.cfg["seeds"][point]), "seed", None, 0

        from engine.agent_gen import generate_and_run
        gen = generate_and_run(self.cov.uncovered(), target=point,
                               dut=self.dut, design=self.design,
                               memory_examples=strategy.library(
                                   self.mem, exclude_design=self.design, cap=2),
                               log=self.log)
        if gen["ok"]:
            return gen["ops"], "ai", gen["result"], gen["tokens"]

        self.log("warn", f"AI generation failed after {gen['attempts']} attempts — using fallback seed")
        return validate(self.cfg["seeds"][point]), "seed", None, gen["tokens"]

    # ---- bug path ------------------------------------------------------

    def _handle_failure(self, ops, mismatches):
        self.log("warn", "scoreboard mismatch — shrinking failure to minimal repro")
        bug = triage.triage(ops, mismatches, dut=self.dut, design=self.design,
                            log=self.log)
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
        self.log("info", f"reading {self.design} interface — "
                         f"{len(self.cfg['points'])} coverage goals")
        if self._warm:
            self.log("info", f"memory — {len(self._warm)} patterns from past designs "
                             f"queued for warm-start")

        for it in range(1, self.max_iters + 1):
            if self._stop or self.cov.percent() >= self.state["target"]:
                break
            self.state["iteration"] = it

            point = strategy.pick_target(self.cov.uncovered(), self.cfg["priority"])
            if point is None:
                break
            self.log("info", f"agent — targeting {self._name(point)}")

            ops, source, result, tokens = self._get_stimulus(point, first_iter=(it == 1))
            self.state["counts"]["tokens_used"] += tokens

            if result is None:
                out = run_stimulus(ops, dut=self.dut, design=self.design)
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

            gained = [self._name(k) for k, hit in result["coverage_hits"].items()
                      if hit and not before_hits.get(k)]
            test_id = self.state["counts"]["tests_generated"]
            explanation, exp_tokens = explain.explain_test(
                self.design, ops, self._name(point), gained,
                result["mismatch_count"])
            self.state["counts"]["tokens_used"] += exp_tokens
            self.state["tests"].append({
                "id": test_id,
                "target": self._name(point),
                "source": source,
                "ops": ops,
                "explanation": explanation,
                "coverage_before": before,
                "coverage_after": self.cov.percent(),
                "gained": gained,
                "mismatches": result["mismatch_count"],
            })

            label = {"ai": "generated", "memory": "replayed", "seed": "seeded"}[source]
            self.log("ok", f"test #{test_id} {label} — "
                           f"ran {result['cycles']} cycles — "
                           f"coverage {before}% -> {self.cov.percent()}%",
                     test_id=test_id)

            # warm-start replays stop paying -> drop the queue, switch to AI
            if getattr(self, "_warm_replay", False) and self.cov.percent() == before \
                    and self._warm:
                self.log("info", f"memory patterns exhausted their value — "
                                 f"{len(self._warm)} skipped, switching to generation")
                self._warm.clear()

            # remember the pattern for every point this test newly closed
            for k, hit in result["coverage_hits"].items():
                if hit and not before_hits.get(k):
                    strategy.remember(self.mem, self.design, k, ops)
            self.state["memory"]["patterns_learned"] = len(self.mem.get("patterns", {}))

            if result["mismatch_count"] and self.state["bug"] is None:
                self._handle_failure(ops, result["mismatches"])

            self.state["counts"]["hours_saved_est"] = (
                self.state["counts"]["tests_generated"] * HOURS_PER_TEST
                + self.state["counts"]["bugs_found"] * HOURS_PER_BUG)
            write_state(self.state)

        self.mem["runs"] = self.mem.get("runs", 0) + 1
        strategy.save_memory(self.mem)

        if self.use_ai and self.state["tests"]:
            self.log("info", "fable-5 — writing the run analysis")
            text, tokens = explain.run_analysis(
                self.state, explain.rtl_source(self.design, self.dut))
            self.state["analysis"] = {"text": text, "model": explain.FABLE_MODEL}
            self.state["counts"]["tokens_used"] += tokens

        self.state["status"] = "done"
        hit, total = self.cov.num_hit(), len(self.cfg["points"])
        self.log("done", f"coverage target reached — {hit} / {total} corner cases"
                 if self.cov.percent() >= self.state["target"] else
                 f"stopped at {self.cov.percent()}% — {hit} / {total} corner cases")
        write_state(self.state)
        return self.state


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--design", default="fifo_8x8", choices=sorted(designs.DESIGNS))
    p.add_argument("--dut", default="buggy", choices=["good", "buggy"])
    p.add_argument("--demo", action="store_true", help="pace the run for presenting")
    p.add_argument("--no-ai", action="store_true", help="fallback seeds only")
    p.add_argument("--reuse-memory", action="store_true", help="flywheel: replay learned patterns")
    args = p.parse_args()
    orch = Orchestrator(design=args.design, dut=args.dut, use_ai=not args.no_ai,
                        demo=args.demo, reuse_memory=args.reuse_memory)
    final = orch.run()
    print(f"\nfinal: {final['coverage_percent']}% — bug: "
          f"{final['bug']['title'] if final['bug'] else 'none'}")


if __name__ == "__main__":
    main()
