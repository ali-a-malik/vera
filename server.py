"""FastAPI server: runs the agent loop in a background thread, serves state.

  GET  /api/state             current state (the engine<->UI contract)
  POST /api/start             body: {dut?, demo?, use_ai?, reuse_memory?}
  POST /api/stop              request the running loop to stop
  POST /api/reset             back to idle (when not running)

Run (in the container):  python server.py        -> http://localhost:8000
"""

import json
import os
import threading

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from engine.orchestrator import Orchestrator
from engine.state import STATE_PATH, initial_state, write_state

app = FastAPI(title="vera")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

_lock = threading.Lock()
_orch = None
_thread = None


class StartOptions(BaseModel):
    design: str = "fifo_8x8"    # "fifo_8x8" | "rr_arbiter"
    dut: str = "buggy"          # "good" | "buggy" (designs without a buggy RTL force good)
    demo: bool = True           # pace log lines for presenting
    use_ai: bool = True
    reuse_memory: bool = False  # flywheel: replay patterns from earlier runs


def _running():
    return _thread is not None and _thread.is_alive()


@app.get("/api/state")
def get_state():
    if _orch is not None:
        return _orch.state
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH) as f:
            return json.load(f)
    return initial_state()


@app.post("/api/start")
def start(opts: StartOptions):
    global _orch, _thread
    with _lock:
        if _running():
            return {"ok": False, "error": "already running"}
        use_ai = opts.use_ai and bool(os.environ.get("PIONEER_API_KEY"))
        _orch = Orchestrator(design=opts.design, dut=opts.dut, demo=opts.demo,
                             use_ai=use_ai, reuse_memory=opts.reuse_memory)
        _thread = threading.Thread(target=_run_safely, daemon=True)
        _thread.start()
        return {"ok": True, "ai": use_ai}


def _run_safely():
    try:
        _orch.run()
    except Exception as e:  # surface engine crashes to the UI instead of dying silently
        _orch.state["status"] = "error"
        _orch.state["activity_log"].append(
            {"t": "--:--", "level": "err", "text": f"engine error: {e}"})
        write_state(_orch.state)
        raise


class ChatRequest(BaseModel):
    question: str
    history: list = []   # [{"role": "user"|"assistant", "content": str}, ...]


@app.post("/api/chat")
def chat(req: ChatRequest):
    """Q&A about the run: opus-4-8 via Pioneer, grounded in the Fable 5
    analysis + the live run data + the RTL."""
    from engine import explain
    state = get_state()
    design = state.get("dut", "fifo_8x8")
    dut = "buggy" if state.get("bug") else "good"
    try:
        answer, tokens = explain.chat(req.question, req.history, state,
                                      explain.rtl_source(design, dut))
    except Exception as e:
        return {"ok": False, "error": str(e)[:300]}
    if _orch is not None:
        _orch.state["counts"]["tokens_used"] += tokens
        write_state(_orch.state)
    return {"ok": True, "answer": answer, "model": explain.CHAT_MODEL,
            "tokens": tokens}


@app.post("/api/stop")
def stop():
    if _orch is not None and _running():
        _orch.stop()
        return {"ok": True}
    return {"ok": False, "error": "not running"}


@app.post("/api/reset")
def reset():
    global _orch
    with _lock:
        if _running():
            return {"ok": False, "error": "still running — stop first"}
        _orch = None
        write_state(initial_state())
        return {"ok": True}


# single-service deploys: serve the built dashboard (web/dist) if present;
# in local dev the Vite dev server on :5173 handles the UI instead
_dist = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web", "dist")
if os.path.isdir(_dist):
    app.mount("/", StaticFiles(directory=_dist, html=True), name="dashboard")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
