"""Runs a stimulus list on the real simulator (cocotb + Icarus via make).

Returns a dict:
  {"ok": True, "result": {...result.json contents...}}
  {"ok": False, "error": "<text suitable for feeding back to the model>"}
"""

import json
import os
import subprocess
import tempfile

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TB_DIR = os.path.join(REPO_ROOT, "tb")

SIM_TIMEOUT_S = 120


def run_stimulus(ops, dut="good"):
    with tempfile.TemporaryDirectory() as tmp:
        stim_path = os.path.join(tmp, "stimulus.json")
        result_path = os.path.join(tmp, "result.json")
        with open(stim_path, "w") as f:
            json.dump(ops, f)

        env = dict(os.environ)
        env["STIMULUS_FILE"] = stim_path
        env["RESULT_FILE"] = result_path
        env["DUT"] = dut

        try:
            proc = subprocess.run(
                ["make", "-s", f"DUT={dut}"],
                cwd=TB_DIR, env=env,
                capture_output=True, text=True, timeout=SIM_TIMEOUT_S,
            )
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": f"simulation timed out after {SIM_TIMEOUT_S}s"}

        if not os.path.exists(result_path):
            tail = (proc.stdout + "\n" + proc.stderr)[-2000:]
            return {"ok": False,
                    "error": f"simulation produced no result (exit {proc.returncode}):\n{tail}"}

        with open(result_path) as f:
            result = json.load(f)

        # cocotb reports test errors in results.xml / output even when the
        # result file exists; an exception inside the test aborts early, so
        # also surface obvious failures from the log
        if "ERROR" in proc.stdout and result.get("cycles", 0) == 0:
            tail = proc.stdout[-2000:]
            return {"ok": False, "error": f"testbench error:\n{tail}"}

        return {"ok": True, "result": result}
