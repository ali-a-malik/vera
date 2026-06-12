"""The two-model layer on top of the loop.

- explain_test(): sonnet-4-6 (cheap, fast) writes a 1-2 sentence plain-English
  explanation of each test as it runs — shown when a feed line is expanded.
- run_analysis(): claude-fable-5 (the heavy brain) writes the post-run
  reasoning: what was tested, what the coverage means, what the bug is and
  why. Stored in state; the chat is grounded in it.

All via the Pioneer endpoint — one key, three models.
"""

import json

from engine.agent_gen import MODEL as GEN_MODEL, client

FABLE_MODEL = "claude-fable-5"
CHAT_MODEL = "claude-opus-4-8"


def rtl_source(design, dut="good"):
    import os
    from engine import designs
    cfg = designs.get(design)
    rtl_file = cfg["rtl"].get(dut, cfg["rtl"]["good"])
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "rtl", rtl_file)
    try:
        with open(path) as f:
            # strip spoiler comments so the models work from evidence
            return "\n".join(l.split("//")[0].rstrip() if "//" in l else l
                             for l in f.read().splitlines())
    except OSError:
        return "(RTL source unavailable)"


def _op_summary(ops):
    """Deterministic fallback: compress an op list to 'reset, write x8, read'."""
    parts, last, count = [], None, 0
    for op in ops:
        name = op["op"]
        if name == last:
            count += 1
        else:
            if last:
                parts.append(f"{last} x{count}" if count > 1 else last)
            last, count = name, 1
    if last:
        parts.append(f"{last} x{count}" if count > 1 else last)
    return ", ".join(parts)


def explain_test(design, ops, target_name, gained_points, mismatch_count):
    """Plain-English what-this-test-does. Returns (text, tokens).
    Falls back to a deterministic summary if the model is unreachable."""
    try:
        msg = client().messages.create(
            model=GEN_MODEL,
            max_tokens=120,
            messages=[{"role": "user", "content": (
                f"A verification test just ran on the {design} design, aimed at the "
                f"corner case '{target_name}'.\n"
                f"The stimulus (one op per clock cycle): {json.dumps(ops)}\n"
                f"It newly covered: {gained_points or 'nothing new'}. "
                f"Mismatches found: {mismatch_count}.\n"
                "In 1-2 plain-English sentences for a non-expert, explain what this "
                "test does and why. No preamble."
            )}],
        )
        return msg.content[0].text.strip(), msg.usage.input_tokens + msg.usage.output_tokens
    except Exception:
        return (f"Drives the sequence: {_op_summary(ops)} — aimed at "
                f"'{target_name}'."), 0


def run_analysis(state, rtl_source):
    """Fable 5 writes the full run rundown. Returns (text, tokens)."""
    ctx = {
        "design": state["dut"],
        "coverage_percent": state["coverage_percent"],
        "points": state["points"],
        "history": state["history"],
        "tests": [{k: t[k] for k in ("id", "target", "source", "explanation",
                                     "coverage_after", "mismatches")}
                  for t in state.get("tests", [])],
        "bug": state["bug"],
        "counts": state["counts"],
    }
    try:
        msg = client().messages.create(
            model=FABLE_MODEL,
            max_tokens=900,
            messages=[{"role": "user", "content": (
                "You are Vera, an autonomous hardware verification engineer. "
                "A verification run just finished on a real simulator (Icarus + cocotb), "
                "with every cycle checked against a known-good reference model.\n\n"
                f"RTL under test:\n```verilog\n{rtl_source}\n```\n\n"
                f"Run data (JSON):\n{json.dumps(ctx, indent=1)}\n\n"
                "Write the engineering rundown of this run in 3 short sections, "
                "plain prose, no markdown headers:\n"
                "1) What was verified and how the coverage was closed.\n"
                "2) The bug (if any): the failure mechanism, why the minimal repro "
                "exposes it, and the fix. If no bug: what gives confidence the design "
                "is clean — and honestly, what was NOT verified.\n"
                "3) What a verification engineer should do next."
            )}],
        )
        return msg.content[0].text.strip(), msg.usage.input_tokens + msg.usage.output_tokens
    except Exception as e:
        return f"(analysis unavailable: {e})", 0


def chat(question, history, state, rtl_source):
    """Opus 4.8 answers questions about the run, grounded in the Fable 5
    analysis + the run data. history = [{"role","content"}, ...]. Returns
    (answer, tokens)."""
    analysis = (state.get("analysis") or {}).get("text", "(no analysis yet)")
    grounding = {
        "design": state["dut"],
        "status": state["status"],
        "coverage_percent": state["coverage_percent"],
        "points": state["points"],
        "tests": [{k: t[k] for k in ("id", "target", "source", "explanation",
                                     "coverage_after", "mismatches")}
                  for t in state.get("tests", [])],
        "bug": state["bug"],
        "counts": state["counts"],
        "activity_log": state["activity_log"][-25:],
    }
    system = (
        "You are Vera, an autonomous hardware verification engineer. Answer "
        "questions about the verification run below. Be concrete and honest — "
        "if something wasn't verified or isn't in the data, say so. Keep "
        "answers short (a few sentences) unless asked to go deep.\n\n"
        f"RTL under test:\n```verilog\n{rtl_source}\n```\n\n"
        f"Run data (JSON):\n{json.dumps(grounding, indent=1)}\n\n"
        f"Deep analysis of the run (written by the reasoning model):\n{analysis}"
    )
    msgs = [{"role": m["role"], "content": m["content"]} for m in history[-12:]]
    msgs.append({"role": "user", "content": question})
    msg = client().messages.create(
        model=CHAT_MODEL, max_tokens=700, system=system, messages=msgs)
    return msg.content[0].text.strip(), msg.usage.input_tokens + msg.usage.output_tokens
