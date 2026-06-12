# Vera — Build Spec
### Autonomous Verification Engineer · Hackathon MVP

> **Repo codename:** `autocov`
> **One-liner:** Vera is an AI agent loop that writes its own hardware tests, runs them on a real simulator, closes coverage on its own, and catches a planted bug — all shown live on a premium dashboard.
> **What this document is:** the single source of truth for what gets built. Read top to bottom; build in the order in §13.
> **Audience:** the builder(s). Plain language, concrete specs, exact file list and data contracts.

---

## 1. What we're building (in one paragraph)

A small piece of hardware (an 8-deep FIFO) exists as code. Vera reads it, figures out which important situations haven't been tested yet, writes tests aimed at those gaps, runs them on a real open-source simulator, checks the results against a known-good model, ticks off coverage, and repeats until coverage hits a target. We plant one bug; Vera drives into the corner that exposes it, shrinks the failure to its smallest form, and explains the likely cause. Everything streams live to a dark, animated "mission-control" dashboard. The whole thing runs on free tools on a laptop.

## 2. Scope

**In scope (build this):**
- One real hardware design (FIFO) + one buggy variant, run on a real simulator.
- A closed agent loop: decide gap → generate test → run → check → measure coverage → repeat.
- AI-generated tests with self-correction (retry on compile/run errors).
- A checker (known-good reference model) so results are actually judged for correctness.
- Failure triage: catch the planted bug, shrink to minimal repro, AI root-cause hypothesis.
- A premium animated dashboard that mirrors the loop live.
- A small "memory" of patterns that worked (the flywheel seed).

**Out of scope (do NOT build):**
- Commercial simulators (VCS/Xcelium/Questa), UVM, formal, emulation.
- SoC scale, multiple complex designs (one DUT; arbiter only as stretch).
- Real coverage-database parsing (we track coverage ourselves in Python).
- Accounts, auth, deployment, multi-tenant, security.
- Sign-off, "trust us it's verified" claims.

## 3. The concepts the build rests on (quick reference)

- **RTL / Verilog:** the hardware described as code (our FIFO).
- **Simulator (Icarus):** a program that pretends to be the chip and runs it tick by tick.
- **Testbench (cocotb):** Python code that pokes the simulated chip with inputs.
- **Stimulus / test:** a specific sequence of pokes.
- **Checker / oracle:** a known-good model we compare against to know if output is *correct*. (The hard, essential part.)
- **Coverage:** a checklist of important situations we want to make sure we exercised. Coverage = what we *tried*, not whether it was *correct* (that's the checker's job).
- **The loop:** generate → run → check → measure coverage → decide next → repeat until target.

## 4. Architecture

Three role-clusters (the "agents") sit on top of the tools, around one orchestrator loop.

```
                    ┌─────────────────────────────────┐
                    │          ORCHESTRATOR            │
                    │  loop until coverage ≥ target    │
                    │  (engine/orchestrator.py)        │
                    └───────┬───────────────┬─────────┘
            picks gap ▲     │ stimulus      │ results ▲
                      │     ▼               ▼         │
        ┌─────────────┴──┐ ┌──────────────┐ ┌─────────┴────────┐
        │ AGENT 3        │ │ AGENT 1       │ │ AGENT 2          │
        │ Strategy       │ │ Generate      │ │ Analyze          │
        │ strategy.py    │ │ agent_gen.py  │ │ analyze.py       │
        │ + memory.json  │ │ (Claude API)  │ │ triage.py        │
        └────────────────┘ └──────┬───────┘ └─────────┬────────┘
                                   │ run             ▲ logs/cov/fail
                                   ▼                 │
                          ┌──────────────────────────┴───┐
                          │  cocotb + Icarus (simulator)  │
                          │  + checker.py (known-good ref)│
                          │  + coverage_model.py          │
                          └───────────────┬──────────────┘
                                          │ writes
                                          ▼
                                ┌───────────────────┐
                                │  state.json        │ ◀── UI polls this
                                │  (engine/state.py) │
                                └───────────────────┘
```

- **Agent 3 (Strategy):** reads coverage, picks the most valuable uncovered point, consults `memory.json`.
- **Agent 1 (Generate):** asks Claude for stimulus aimed at that point; retries on errors.
- **Simulator + checker:** runs the stimulus tick by tick; compares every output to a known-good reference; ticks coverage.
- **Agent 2 (Analyze):** updates coverage, clusters + shrinks failures, asks Claude for a root cause.
- **Orchestrator:** runs the cycle, writes `state.json` each iteration.
- **Dashboard:** does no logic; polls `state.json` once a second and redraws.

## 5. Tech stack (exact)

| Layer | Choice | Notes |
|---|---|---|
| Simulator | **Icarus Verilog** (`iverilog`) | Free, simple to install, no C++ build step. (Verilator only if you want speed later.) |
| Testbench | **cocotb** | Python testbenches — easy for the AI to generate. |
| Coverage | **hand-rolled Python model** | Track corner cases ourselves; skip simulator coverage-file parsing. |
| Engine | **Python 3.11+** | The orchestrator + agents. |
| LLM | **Anthropic API**, model `claude-sonnet-4-6` | Fast + cheap enough to loop. Bump to a larger model only if test quality is poor. |
| Server | **FastAPI + uvicorn** | Runs the loop in a background thread, serves `GET /api/state`. |
| UI | **React + Vite** | The dashboard app. |
| Styling | **Tailwind CSS** | Premium dark theme via custom tokens (§11). |
| Animation | **Framer Motion** | Number tween, line draw, checklist flips, bug-card entrance. |
| Chart | **Recharts** | Coverage-over-time line chart. |

---

## 6. The hardware under test (DUT)

A parameterized synchronous FIFO. Keep it under ~50 lines.

**Interface (`rtl/fifo.v`):**

```
module fifo #(parameter WIDTH = 8, parameter DEPTH = 8) (
  input  wire              clk,
  input  wire              rst,      // synchronous reset, active high
  input  wire              wr_en,
  input  wire              rd_en,
  input  wire [WIDTH-1:0]  din,
  output reg  [WIDTH-1:0]  dout,
  output wire              full,
  output wire              empty,
  output wire [$clog2(DEPTH):0] count
);
```

Behavior: standard circular-buffer FIFO. `full` high when `count == DEPTH`; `empty` high when `count == 0`. Writes ignored when full; reads ignored when empty. Simultaneous read+write when neither full nor empty leaves `count` unchanged.

**The planted bug (`rtl/fifo_buggy.v`):** the full flag asserts one slot early —

```
// correct:  assign full = (count == DEPTH);
// buggy:    assign full = (count == DEPTH-1);
```

Effect: the FIFO claims full at 7 items instead of 8, silently losing one slot of capacity and rejecting a legal 8th write. Only caught by a test that fills the FIFO to the brink and checks `full`.

The testbench picks good vs buggy via an env var or Makefile flag (e.g. `DUT=buggy`).

## 7. Coverage model

Six corner cases tracked in `engine/coverage_model.py`. Each is marked hit by the testbench when the situation occurs during a run.

| Key | Hit when |
|---|---|
| `wrote_until_full` | `count` reaches `DEPTH` |
| `read_until_empty` | `count` returns to 0 after being non-zero |
| `simultaneous_read_write` | `wr_en` and `rd_en` both high in the same cycle |
| `pointer_wraparound` | write or read pointer wraps past `DEPTH-1` back to 0 |
| `write_while_full` | `wr_en` high while `full` is high (overflow attempt) |
| `read_while_empty` | `rd_en` high while `empty` is high (underflow attempt) |

Coverage percent = (points hit / 6) × 100. The model exposes `reset()`, `mark(key)`, `hits()`, `percent()`.

## 8. The stimulus format (data contract for tests)

Tests are passed around as **data**, not raw Python, so the AI generates a simple list and the runner executes it. One operation per clock cycle:

```json
[
  {"op": "reset"},
  {"op": "write", "val": 163},
  {"op": "write", "val": 92},
  {"op": "read"},
  {"op": "write_read", "val": 17},
  {"op": "idle"}
]
```

- `write` → set `wr_en=1`, `din=val` for one cycle.
- `read` → set `rd_en=1`.
- `write_read` → both high (tests simultaneous path).
- `reset` → `rst=1` one cycle.
- `idle` → all enables low.

The runner (`tb/test_fifo.py`) walks the list, drives signals each cycle, runs the checker, and updates coverage.

## 9. The checker (oracle)

In `engine/checker.py`, keep a **known-good Python FIFO** — a plain list with the correct full/empty/count rules. Feed it the *same* operations as the DUT. After every cycle, compare DUT outputs (`dout`, `full`, `empty`, `count`) to the reference. On any mismatch, record:

```json
{
  "cycle": 14,
  "stimulus": [ ...the full op list up to here... ],
  "expected": {"full": false, "count": 7},
  "got":      {"full": true,  "count": 7}
}
```

This is what makes the demo honest: coverage says what we exercised; the checker says whether it was correct.

## 10. The agent loop in detail

One iteration of `orchestrator.py`:

1. **Strategy (`strategy.py`):** read coverage; pick the highest-value uncovered point. Check `memory.json` for a known stimulus pattern that closes it. Emit log line "targeting X".
2. **Generate (`agent_gen.py`):** build a prompt = FIFO interface + list of uncovered points + 2 example stimulus lists, ask `claude-sonnet-4-6` to return a stimulus list as JSON only. Parse it.
3. **Run + retry:** execute the stimulus via cocotb/Icarus (subprocess). If it errors, send the error back to Claude (max 3 tries) for a fix. Emit "generated test #N · compiled ok".
4. **Check + score (inside the run):** drive the DUT, run the checker every cycle, mark coverage points. Collect any mismatches.
5. **Analyze (`analyze.py` + `triage.py`):** merge coverage; if mismatches exist, cluster duplicates by signature, then **shrink** — re-run progressively smaller slices of the failing op list through the sim until the shortest still-failing sequence is found.
6. **Root-cause:** send the minimal failing sequence + expected/got to Claude, get a one-paragraph hypothesis.
7. **Memory:** if a point was closed, append its winning stimulus pattern to `memory.json`.
8. **Emit state:** write `state.json` (§12). Loop back unless `coverage ≥ target` or `iteration ≥ max_iters`.

**Prompt sketches (keep short):**
- *Generate:* "You are generating test stimulus for this FIFO [interface]. These corner cases are NOT yet covered: [list]. Return ONLY a JSON array of operations (ops: reset/write/read/write_read/idle) designed to hit them. Examples: [2 examples]."
- *Root-cause:* "This FIFO failed. Smallest failing sequence: [ops]. Expected [x], got [y]. In one short paragraph, what's the most likely cause?"

## 11. The dashboard (premium dark, animated)

The UI does no logic — it polls `GET /api/state` once a second and renders. All visible change animates.

**Design tokens (`web/src/theme.js` / Tailwind config):**

| Token | Value | Use |
|---|---|---|
| `bg` | `#0B0E14` | page background (deep near-black, blue-gray tint) |
| `surface` | `#141925` | panels/cards |
| `border` | `rgba(255,255,255,0.08)` | thin panel borders |
| `accent` | `#34D399` | progress / good — coverage line, covered checks, status dot |
| `alert` | `#F87171` | bug only — nothing else uses red |
| `text` | `#E6E8EC` | primary text |
| `text-dim` | `#8B93A7` | secondary |
| `text-faint` | `#5A6275` | hints, axis labels |
| font UI | Inter | everything |
| font mono | JetBrains Mono | all numbers, the log, code |
| radius | `14px` | cards |

**Color discipline:** one accent (green/teal), one alert (red), the rest grayscale. No other colors.

**Layout (top to bottom):**
- **Top bar:** "Vera" wordmark · pulsing green "running" status pill · `DUT: fifo_8x8` chip · big mono coverage % + "iteration N" on the right.
- **Hero — coverage chart:** Recharts line climbing toward a dashed 95% target, flat low-opacity accent fill under the line.
- **Two columns:** left = coverage checklist (6 items; gray "unhit" → glowing green check when hit); right = activity feed (mono, timestamped lines, newest streaming in at the bottom; the bug line is red).
- **Bug card:** hidden until `bug != null`, then enters with a fade + slight scale and an alert glow. Header "bug found — …", minimal repro as a short step list, hypothesis below.
- **Stats strip:** 4 tiles — tests generated, bugs found (red), est. hours saved, tokens used.

**Required animations (Framer Motion):**
- Big coverage number **tweens** up smoothly (never jumps).
- Chart line **draws** to each new point as it arrives.
- Checklist items **flip** gray→green with a brief glow pulse.
- Status dot **breathes** (pulse) while running.
- Activity log lines **stream in** (fade + slight slide).
- Bug card gets the one **dramatic entrance**.
- A barely-there animated grid in the page background for "live" feel.

(See §3 of the conversation's UI spec for the full rationale; this is the binding summary.)

## 12. The state contract (engine ↔ UI)

`engine/state.py` writes this to `web/public/state.json` each iteration; `server.py` serves it at `GET /api/state`. The UI renders entirely from this.

```json
{
  "status": "idle | running | done",
  "dut": "fifo_8x8",
  "coverage_percent": 83,
  "target": 95,
  "iteration": 6,
  "history": [{"iter": 0, "coverage": 0}, {"iter": 1, "coverage": 18}],
  "points": [
    {"name": "wrote until full", "hit": true},
    {"name": "read while empty", "hit": false}
  ],
  "activity_log": [
    {"t": "00:12", "level": "info",    "text": "targeting pointer wrap-around"},
    {"t": "00:13", "level": "success", "text": "coverage 71% -> 83%"},
    {"t": "00:14", "level": "warn",    "text": "mismatch found - shrinking"}
  ],
  "counts": {"tests_generated": 6, "bugs_found": 1, "hours_saved_est": 14, "tokens_used": 38000},
  "bug": {
    "title": "full flag asserts one slot early",
    "minimal_repro": ["reset", "write x7", "read full -> HIGH (expected LOW)", "8th write rejected"],
    "hypothesis": "Full check uses count >= DEPTH-1 instead of >= DEPTH. Off-by-one in the full-flag logic."
  },
  "memory": {"patterns_learned": 3}
}
```

`bug` is `null` until found. `level` drives the log line color (info=dim, success=green, warn=red).

## 13. Repo structure

```
vera/
├── rtl/
│   ├── fifo.v            # correct FIFO
│   ├── fifo_buggy.v      # off-by-one full flag
│   └── arbiter.v         # stretch only
├── tb/
│   ├── test_fifo.py      # cocotb runner: drives ops, runs checker, marks coverage
│   └── Makefile          # SIM=icarus, DUT switch
├── engine/
│   ├── orchestrator.py   # the loop
│   ├── strategy.py       # Agent 3
│   ├── agent_gen.py      # Agent 1 (Anthropic API)
│   ├── analyze.py        # Agent 2
│   ├── triage.py         # cluster + shrink
│   ├── checker.py        # known-good reference FIFO (oracle)
│   ├── coverage_model.py # the 6 corner cases
│   ├── state.py          # writes state.json
│   └── memory.json       # learned patterns
├── server.py             # FastAPI: runs loop in bg thread + GET /api/state
├── web/                  # React + Vite + Tailwind + Framer Motion + Recharts
│   ├── src/
│   │   ├── App.jsx
│   │   ├── usePolling.js
│   │   ├── theme.js
│   │   └── components/
│   │       ├── TopBar.jsx
│   │       ├── CoverageChart.jsx
│   │       ├── Checklist.jsx
│   │       ├── ActivityFeed.jsx
│   │       ├── BugCard.jsx
│   │       └── StatsStrip.jsx
│   └── public/state.json # written by engine in dev
├── run.sh                # starts server + UI together
└── README.md             # setup + demo script
```

## 14. Build order (milestones — don't skip checkpoints)

This mirrors the prompt playbook. Each phase ends with a checkpoint that must pass before moving on.

1. **Foundation** — project, `fifo.v`, one hand-written cocotb test on Icarus. ✅ *test passes.*
2. **Coverage** — `coverage_model.py`; mark points in the test; print %. ✅ *"4/6 — 67%".*
3. **Loop (no AI)** — `orchestrator.py` runs data-driven stimulus, accumulates coverage over a few hand-written tests. ✅ *coverage rises across iterations.*
4. **Generate agent** — `agent_gen.py` + run/retry; plug into loop. ✅ *coverage climbs from AI-written tests.* (Core.)
5. **Bug + checker + triage** — `fifo_buggy.v`, `checker.py`, `triage.py` shrink, root-cause. ✅ *catches bug, prints minimal repro + hypothesis.*
6. **State + server** — `state.py` writes the contract; `server.py` serves it. ✅ *`/api/state` updates live.*
7. **Dashboard (mock data)** — full premium UI animating on a fake state on a timer. ✅ *looks finished, ends with bug card.*
8. **Connect** — UI polls real `/api/state`; keep all animations. ✅ *one command runs the real thing end to end.*
9. **Polish** — `memory.json`, `--demo` pacing, pre-seeded first test, `run.sh`, README + fallbacks. ✅ *`./run.sh` just works.*
10. **Stretch** — `arbiter.v` + pattern reuse from memory ("reused 3 patterns" badge, faster climb).

## 15. The 3-minute demo script

1. **(0:00) Hook** — idle dashboard up. "Verification is 60–70% of chip work and it's all manual. We pointed AI at the whole loop. Watch."
2. **(0:20) Go** — click Start; status dot pulses; first log line appears.
3. **(0:35) Climb** — narrate as coverage tweens up, the line draws, checklist boxes light green. Point out the self-fix: "wrote a broken test, read the error, fixed itself."
4. **(1:40) Bug** — feed line turns red, bug card enters. Pause. "We planted an off-by-one. It drove into the corner, caught the mismatch, shrank it to 7 writes, and here's its guess at the cause."
5. **(2:20) Flywheel** — coverage hits target; status "done"; (stretch) run on the arbiter, show faster climb + "reused patterns" badge. "Every pattern that worked is saved — new designs start smarter."
6. **(2:50) Vision** — "Today: a FIFO on a free simulator. Same loop scales to real chips on the tools companies pay millions for. This is the wedge for an autonomous verification engineer."

## 16. Risks & live-demo fallbacks

- **Simulator setup fights you (>2h):** swap the Verilog FIFO + Icarus for a pure-Python FIFO model the same op-lists run against. Everything downstream still works; you only lose the "real hardware" line.
- **AI generates broken tests:** the run/retry wrapper handles it; cap at 3, then fall back to a pre-seeded test so the loop never stalls.
- **API latency/outage on stage:** pre-seed known-good tests so coverage always starts moving; cache a couple of generated tests; `--demo` mode can replay a recorded run.
- **Anything breaks at 2am:** record a clean run as a backup video by the polish phase. Non-negotiable.

## 17. Non-goals (restate, so nobody gold-plates)

No commercial tools, no UVM, no formal, no emulation, no SoC, no second complex design, no auth/deploy, no real coverage-DB parsing, no sign-off claims. One FIFO, one bug, one beautiful loop. Ship that.

