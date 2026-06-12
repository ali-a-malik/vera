"""Agent 1 — Generate: asks the model for stimulus aimed at uncovered points.

Inference runs on Pioneer.ai via its Anthropic-compatible endpoint
(https://docs.pioneer.ai/concepts/inference), so the standard Anthropic SDK
is pointed at PIONEER_BASE_URL and authenticated with PIONEER_API_KEY.

generate_and_run() is the full loop step: generate -> validate -> run on the
simulator -> on error, feed the error text back to the model (max 3 attempts).
"""

import json
import os
import re

import anthropic

from engine.runner import run_stimulus
from engine.stimulus import StimulusError, validate

MODEL = "claude-sonnet-4-6"
PIONEER_BASE_URL = "https://api.pioneer.ai"  # SDK appends /v1/messages
MAX_ATTEMPTS = 3

POINT_HINTS = {
    "wrote_until_full": "write until count reaches 8 (DEPTH) without reading",
    "read_until_empty": "after writing some values, read until count returns to 0",
    "simultaneous_read_write": "use write_read while the FIFO is neither full nor empty",
    "pointer_wraparound": "complete more than 8 successful writes (and/or 8 reads) so a pointer wraps past index 7 back to 0",
    "write_while_full": "fill the FIFO completely (8 writes), then issue another write",
    "read_while_empty": "issue a read while the FIFO is empty (count == 0)",
}

SYSTEM = """You generate test stimulus for a hardware FIFO verification run.

The DUT is a synchronous FIFO, WIDTH=8 DEPTH=8:
  inputs:  clk, rst, wr_en, rd_en, din[7:0]
  outputs: dout[7:0], full, empty, count
Writes are ignored when full; reads are ignored when empty.

A stimulus is a JSON array of operations, one per clock cycle:
  {"op": "reset"}                  rst=1 for one cycle
  {"op": "write", "val": N}        wr_en=1, din=N (0..255)
  {"op": "read"}                   rd_en=1
  {"op": "write_read", "val": N}   wr_en=1 and rd_en=1 in the same cycle
  {"op": "idle"}                   all enables low

Respond with ONLY the JSON array — no prose, no code fences."""

EXAMPLE_1 = ('[{"op": "reset"}, {"op": "write", "val": 163}, {"op": "write", "val": 92}, '
             '{"op": "read"}, {"op": "read"}, {"op": "read"}]')
EXAMPLE_2 = ('[{"op": "reset"}, {"op": "write", "val": 10}, {"op": "write_read", "val": 20}, '
             '{"op": "write_read", "val": 30}, {"op": "read"}, {"op": "idle"}]')

_client = None


def client():
    global _client
    if _client is None:
        key = os.environ.get("PIONEER_API_KEY")
        if not key:
            raise RuntimeError("PIONEER_API_KEY is not set")
        _client = anthropic.Anthropic(api_key=key, base_url=PIONEER_BASE_URL)
    return _client


def build_prompt(uncovered, target=None, error_feedback=None, prev_stimulus=None):
    target = target or uncovered[0]
    lines = [f"Your target corner case: {target} — {POINT_HINTS[target]}"]
    lines.append("")
    lines.append("Start with a reset. Design ONE minimal, surgical stimulus list "
                 "(under 16 ops) that hits exactly this target — do not pad the "
                 "test with unrelated activity.")
    lines.append(f"Example stimulus A: {EXAMPLE_1}")
    lines.append(f"Example stimulus B: {EXAMPLE_2}")
    if error_feedback:
        lines.append("")
        lines.append(f"Your previous attempt was: {json.dumps(prev_stimulus) if prev_stimulus else '(unparseable)'}")
        lines.append(f"It failed with this error — fix it:\n{error_feedback}")
    return "\n".join(lines)


def parse_response(text):
    """Extract a JSON array from the model response (tolerates stray fences)."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-z]*\s*|\s*```$", "", text)
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1:
        raise StimulusError("response contains no JSON array")
    return json.loads(text[start:end + 1])


def generate_stimulus(uncovered, target=None, error_feedback=None, prev_stimulus=None):
    """One model call. Returns (ops, tokens_used). Raises on parse failure."""
    msg = client().messages.create(
        model=MODEL,
        max_tokens=4000,
        system=SYSTEM,
        messages=[{"role": "user",
                   "content": build_prompt(uncovered, target, error_feedback, prev_stimulus)}],
    )
    tokens = msg.usage.input_tokens + msg.usage.output_tokens
    ops = validate(parse_response(msg.content[0].text))
    return ops, tokens


def generate_and_run(uncovered, target=None, dut="good", log=lambda *a: None):
    """generate -> run, feeding errors back to the model. Max 3 attempts.

    Returns {"ok": bool, "ops": [...], "result": {...}, "tokens": int,
             "attempts": int, "error": str|None}
    """
    tokens_total = 0
    error, prev = None, None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            ops, tokens = generate_stimulus(uncovered, target, error, prev)
            tokens_total += tokens
        except (StimulusError, json.JSONDecodeError) as e:
            error, prev = str(e), None
            log("warn", f"attempt {attempt}: bad stimulus from model — {e}")
            continue

        out = run_stimulus(ops, dut=dut)
        if out["ok"]:
            return {"ok": True, "ops": ops, "result": out["result"],
                    "tokens": tokens_total, "attempts": attempt, "error": None}

        error, prev = out["error"], ops
        log("warn", f"attempt {attempt}: run error — feeding back to model")

    return {"ok": False, "ops": prev, "result": None,
            "tokens": tokens_total, "attempts": MAX_ATTEMPTS, "error": error}
