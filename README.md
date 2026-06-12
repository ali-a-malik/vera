# Vera — Autonomous Verification Engineer

Vera is an AI agent loop that writes its own hardware tests, runs them on a
real simulator (Icarus Verilog + cocotb), checks every cycle against a
known-good reference model, closes coverage on its own, and catches a planted
bug — shrinking it to a minimal repro and explaining the likely cause — all
streamed live to a dashboard.

## Architecture

```
ORCHESTRATOR (engine/orchestrator.py) — loop until coverage ≥ 95%
 ├─ Strategy  (strategy.py + memory.json)  picks the next uncovered corner case
 ├─ Generate  (agent_gen.py, claude-sonnet-4-6)  writes stimulus; retries on errors
 ├─ Run       (runner.py → tb/ → cocotb + Icarus)  real simulation, one op/cycle
 ├─ Check     (checker.py)  known-good Python FIFO compared every cycle (the oracle)
 ├─ Coverage  (coverage_model.py)  6 hand-rolled corner cases
 └─ Analyze   (triage.py)  cluster → shrink to minimal repro → root-cause + fix
      ↓ writes state.json each step
 server.py (FastAPI, GET /api/state)  ←  web/ (React + Vite dashboard, polls 1 Hz)
```

Coverage tracks what was *exercised*; the checker decides *correctness*.

## Setup

Everything simulator-side runs in Docker — no local iverilog/cocotb needed.

1. **Docker runtime** (one-time): `brew install colima docker docker-compose`
2. **API key**: create `.env` in the repo root (gitignored):
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   Without it the loop still completes using fallback seed tests, but AI test
   generation and the root-cause hypothesis are disabled.
3. **Check**: `./setup-check.sh`

## Run

```sh
./run.sh
```

Starts the engine container (http://localhost:8000) and the dashboard
(http://localhost:5173, opens automatically). Press **Start**.

Useful pieces:

```sh
docker compose up -d                 # engine only
cd web && npm run dev                # dashboard only
docker compose down                  # stop the engine
docker compose logs -f               # engine logs

# engine CLI (inside the container):
docker compose exec engine python -m engine.orchestrator --dut buggy --demo
docker compose exec engine python -m engine.orchestrator --dut good --no-ai
cd tb && make DUT=buggy              # raw cocotb run (inside container)
```

API: `GET /api/state` · `POST /api/start {dut, demo, use_ai, reuse_memory}` ·
`POST /api/stop` · `POST /api/reset`.

## The planted bug

`rtl/fifo_buggy.v` asserts `full` one slot early (`count == DEPTH-1`).
The FIFO claims full at 7 of 8 entries and silently rejects a legal 8th write.
Only a test that fills the FIFO to the brink exposes it — Vera's checker
catches the mismatch, shrinks the failure to 7 writes, and the model explains
the off-by-one and proposes the one-line fix.

## 3-minute demo script

1. **(0:00) Hook** — dashboard idle. "Verification is 60–70% of chip work and
   it's all manual. We pointed AI at the whole loop. Watch."
2. **(0:20) Go** — press Start. Status dot pulses; first log line appears.
3. **(0:35) Climb** — coverage tweens up, the line draws, checks flip green.
   Point out self-correction: when a generated test errors, the error text is
   fed back to the model and it fixes its own test.
4. **(1:40) Bug** — the feed turns red; the bug card enters. "We planted an
   off-by-one. Vera drove into the corner, caught the mismatch against the
   reference model, shrank it to 7 writes, and explained the cause." Click
   **Inspect failure** for the waveform + suggested fix.
5. **(2:20) Flywheel** — coverage hits target; "patterns learned" badge.
   "Every pattern that worked is saved — new designs start smarter."
6. **(2:50) Vision** — "Today: a FIFO on a free simulator. The same loop
   scales to real chips on commercial tools."

## Live-demo fallbacks

- **Backend dies on stage**: the dashboard auto-detects the engine is
  unreachable and switches to a built-in scripted replay (a "demo replay"
  chip appears) — the visuals still tell the story.
- **API outage**: start with `use_ai: false` (or just let attempts fail) —
  the loop falls back to pre-seeded tests and still finds the bug.
- **First test is pre-seeded** so coverage moves immediately on Start.

## Repo map

```
rtl/        fifo.v (correct), fifo_buggy.v (planted off-by-one full flag)
tb/         cocotb data-driven runner + Makefile (SIM=icarus, DUT=good|buggy)
engine/     orchestrator, strategy+memory, agent_gen, runner, checker,
            coverage_model, triage, state
server.py   FastAPI: loop in a background thread + /api/*
web/        React+Vite dashboard (polls /api/state at 1 Hz)
Dockerfile  python3.12 + iverilog + cocotb + fastapi + anthropic
run.sh      one command: engine container + dashboard
```
