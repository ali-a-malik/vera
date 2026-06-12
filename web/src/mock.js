// The self-running demo replay — the on-stage fallback when the backend is
// unreachable, and the standalone mode for UI development. Emits the exact
// engine<->UI state contract so every component is driven identically.

import { useEffect, useState } from "react";

export const POINT_NAMES = [
  "wrote until full",
  "read until empty",
  "simultaneous read + write",
  "pointer wrap-around",
  "write while full",
  "read while empty",
];

const BUG = {
  title: "full flag asserts one slot early",
  severity: "functional",
  minimal_repro: [
    "reset",
    "write x7  (count -> 7)",
    "full: expected False, got True",
    "8th write rejected · one slot lost",
  ],
  minimal_ops: Array.from({ length: 7 }, (_, i) => ({ op: "write", val: 16 + i })),
  expected: { full: false, count: 7 },
  got: { full: true, count: 7 },
  hypothesis:
    "The full condition compares count >= DEPTH-1 instead of count >= DEPTH — a one-slot off-by-one. The FIFO reports full at 7 of 8 entries, silently dropping the 8th write. Only stimulus that fills the buffer to the brink and reads `full` exposes it.",
  fix: {
    from: "assign full = (count == DEPTH-1);",
    to: "assign full = (count == DEPTH);",
  },
};

const BEATS = [
  { log: ["info", "reading fifo_8x8 interface · 6 coverage goals"], status: "running", tok: 3 },
  { log: ["dim", "agent · targeting wrote-until-full"], tok: 1 },
  { log: ["ok", "test #1 generated · compiled · ran 1,000 cycles"], cov: 18, hit: 0, tests: 1, tok: 4 },
  { log: ["dim", "agent · targeting read-until-empty"], tok: 1 },
  { log: ["ok", "test #2 generated · compiled · ran 1,000 cycles"], cov: 34, hit: 1, tests: 2, tok: 3 },
  { log: ["dim", "agent · targeting simultaneous read + write"], tok: 1 },
  { log: ["warn", "compile error in test #3 · feeding error back to model"], tok: 2 },
  { log: ["ok", "test #3 fixed · compiled · ran 1,000 cycles"], cov: 52, hit: 2, tests: 3, tok: 4 },
  { log: ["dim", "agent · targeting pointer wrap-around"], tok: 1 },
  { log: ["ok", "test #4 generated · compiled · ran 1,000 cycles"], cov: 67, hit: 3, tests: 4, tok: 3 },
  { log: ["dim", "agent · targeting write-while-full"], tok: 1 },
  { log: ["ok", "test #5 generated · ran 1,000 cycles"], cov: 83, hit: 4, tests: 5, tok: 4 },
  { log: ["warn", "scoreboard mismatch · shrinking failure to minimal repro"], tok: 2 },
  { log: ["err", "bug · full asserts one slot early"], bug: true, bugs: 1, tok: 4 },
  { log: ["dim", "agent · targeting read-while-empty"], tok: 1 },
  { log: ["ok", "test #6 generated · compiled · ran 1,000 cycles"], cov: 100, hit: 5, tests: 6, status: "done", tok: 4 },
  { log: ["done", "coverage target reached · 6 / 6 corner cases"], tok: 0 },
];

export const initialState = () => ({
  status: "idle",
  dut: "fifo_8x8",
  coverage_percent: 0,
  target: 95,
  iteration: 0,
  history: [{ iter: 0, coverage: 0 }],
  points: POINT_NAMES.map((name) => ({ name, hit: false })),
  activity_log: [],
  counts: { tests_generated: 0, bugs_found: 0, hours_saved_est: 0, tokens_used: 0 },
  bug: null,
  memory: { patterns_learned: 0 },
});

const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function useMockEngine(enabled) {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    if (!enabled) return;
    let step = 0;
    let clock = 0;
    let timer;
    let cancelled = false;

    const apply = (b) =>
      setState((s) => {
        const n = {
          ...s,
          counts: { ...s.counts },
          history: s.history,
          points: s.points,
          activity_log: s.activity_log,
        };
        clock += b.tok ? 2 : 1;
        if (b.status) n.status = b.status;
        if (b.cov != null) {
          n.coverage_percent = b.cov;
          n.iteration = b.tests ?? s.iteration;
          n.history = [...s.history, { iter: b.tests ?? s.iteration, coverage: b.cov }];
        }
        if (b.hit != null)
          n.points = s.points.map((p, i) => (i === b.hit ? { ...p, hit: true } : p));
        if (b.tests != null) n.counts.tests_generated = b.tests;
        if (b.bugs != null) n.counts.bugs_found = b.bugs;
        if (b.tok) n.counts.tokens_used = s.counts.tokens_used + b.tok * 1000;
        n.counts.hours_saved_est = Math.round(
          (b.tests ?? s.counts.tests_generated) * 2.3
        );
        if (b.bug) n.bug = BUG;
        if (b.log)
          n.activity_log = [
            ...s.activity_log,
            { level: b.log[0], text: b.log[1], t: fmt(clock) },
          ].slice(-20);
        return n;
      });

    const tick = () => {
      if (cancelled) return;
      if (step < BEATS.length) {
        apply(BEATS[step]);
        step += 1;
        timer = setTimeout(tick, 1250);
      } else {
        timer = setTimeout(() => {
          setState((s) => ({ ...initialState(), bug: s.bug }));
          clock = 0;
          step = 0;
          tick();
        }, 3800);
      }
    };

    setState(initialState());
    timer = setTimeout(tick, 700);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled]);

  return state;
}
