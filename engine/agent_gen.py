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

from engine import designs

MODEL = "claude-sonnet-4-6"
PIONEER_BASE_URL = "https://api.pioneer.ai"  # SDK appends /v1/messages
MAX_ATTEMPTS = 3


def system_prompt(design):
    cfg = designs.get(design)
    return (f"You generate test stimulus for a hardware verification run.\n\n"
            f"{cfg['system_interface']}\n\n"
            "A stimulus is a JSON array of those operations, one per clock cycle.\n"
            "Respond with ONLY the JSON array — no prose, no code fences.")

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


def build_prompt(design, uncovered, target=None, error_feedback=None,
                 prev_stimulus=None, memory_examples=None):
    cfg = designs.get(design)
    target = target or uncovered[0]
    lines = [f"Your target corner case: {target} — {cfg['hints'][target]}"]
    lines.append("")
    lines.append("Start with a reset. Design ONE minimal, surgical stimulus list "
                 "(under 16 ops) that hits exactly this target — do not pad the "
                 "test with unrelated activity.")
    lines.append(f"Example stimulus A: {EXAMPLE_1}")
    lines.append(f"Example stimulus B: {EXAMPLE_2}")
    for src_design, point, ops in (memory_examples or []):
        lines.append(f"Pattern that worked on {src_design} (closed {point}): "
                     f"{json.dumps(ops)}")
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


def generate_stimulus(design, uncovered, target=None, error_feedback=None,
                      prev_stimulus=None, memory_examples=None):
    """One model call. Returns (ops, tokens_used). Raises on parse failure."""
    msg = client().messages.create(
        model=MODEL,
        max_tokens=4000,
        system=system_prompt(design),
        messages=[{"role": "user",
                   "content": build_prompt(design, uncovered, target, error_feedback,
                                           prev_stimulus, memory_examples)}],
    )
    tokens = msg.usage.input_tokens + msg.usage.output_tokens
    ops = validate(parse_response(msg.content[0].text))
    return ops, tokens


def generate_and_run(uncovered, target=None, dut="good", design="fifo_8x8",
                     memory_examples=None, log=lambda *a: None):
    """generate -> run, feeding errors back to the model. Max 3 attempts.

    Returns {"ok": bool, "ops": [...], "result": {...}, "tokens": int,
             "attempts": int, "error": str|None}
    """
    tokens_total = 0
    error, prev = None, None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            ops, tokens = generate_stimulus(design, uncovered, target, error, prev,
                                            memory_examples)
            tokens_total += tokens
        except (StimulusError, json.JSONDecodeError) as e:
            error, prev = str(e), None
            log("warn", f"attempt {attempt}: bad stimulus from model — {e}")
            continue

        out = run_stimulus(ops, dut=dut, design=design)
        if out["ok"]:
            return {"ok": True, "ops": ops, "result": out["result"],
                    "tokens": tokens_total, "attempts": attempt, "error": None}

        error, prev = out["error"], ops
        log("warn", f"attempt {attempt}: run error — feeding back to model")

    return {"ok": False, "ops": prev, "result": None,
            "tokens": tokens_total, "attempts": MAX_ATTEMPTS, "error": error}
