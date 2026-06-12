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
    dut: str = "buggy"          # "good" | "buggy"
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
        _orch = Orchestrator(dut=opts.dut, demo=opts.demo, use_ai=use_ai,
                             reuse_memory=opts.reuse_memory)
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


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
