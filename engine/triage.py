"""Agent 2 support — failure triage: cluster duplicates, shrink to a minimal
repro, ask the model for a root-cause hypothesis.
"""

import json

from engine.runner import run_stimulus

MAX_SHRINK_RUNS = 40


def signature(mismatch):
    """Cluster key: which fields diverged and how."""
    return json.dumps({"expected": mismatch["expected"], "got": mismatch["got"]},
                      sort_keys=True)


def cluster(mismatches):
    """Group mismatches by signature; returns one representative per cluster."""
    seen = {}
    for m in mismatches:
        seen.setdefault(signature(m), m)
    return list(seen.values())


def _fails(ops, dut, design):
    out = run_stimulus(ops, dut=dut, design=design)
    return out["ok"] and out["result"]["mismatch_count"] > 0


def shrink(ops, dut="buggy", design="fifo_8x8", log=lambda *a: None):
    """Find a small sub-sequence of `ops` that still produces a mismatch.

    1. Truncate to the first mismatch cycle (ops after it are irrelevant).
    2. Greedily drop ops one at a time, keeping any removal that still fails.
    Each probe is a real simulator run; capped at MAX_SHRINK_RUNS.
    """
    runs = 0

    out = run_stimulus(ops, dut=dut, design=design)
    if not (out["ok"] and out["result"]["mismatch_count"] > 0):
        return ops  # can't reproduce; return as-is
    first_bad = out["result"]["mismatches"][0]["cycle"]
    current = ops[:first_bad + 1]
    runs += 1

    i = len(current) - 2  # never drop the final (failing) op
    while i >= 0 and runs < MAX_SHRINK_RUNS:
        candidate = current[:i] + current[i + 1:]
        runs += 1
        if candidate and _fails(candidate, dut, design):
            current = candidate
        i -= 1

    log("info", f"shrunk {len(ops)} ops -> {len(current)} in {runs} sim runs")
    return current


def describe_repro(minimal_ops, mismatch):
    """Human-readable repro steps for the UI."""
    steps, run = [], 0
    for op in minimal_ops:
        name = op["op"]
        if name == "write":
            run += 1
            continue
        if run:
            steps.append(f"write x{run}")
            run = 0
        steps.append(name.replace("_", " + "))
    if run:
        steps.append(f"write x{run}")
    exp, got = mismatch["expected"], mismatch["got"]
    for field in exp:
        steps.append(f"{field}: expected {exp[field]}, got {got[field]}")
    return steps


def root_cause(minimal_ops, mismatch, dut="buggy", design="fifo_8x8"):
    """Hypothesis + suggested fix from the model, given the failing stimulus
    AND the RTL source (verification engineers have RTL access; so does Vera).
    Returns ({"hypothesis": str, "fix": {"from","to"}|None}, tokens).
    Degrades gracefully without an API key."""
    import os
    from engine import designs
    cfg = designs.get(design)
    rtl_file = cfg["rtl"].get(dut, cfg["rtl"]["good"])
    rtl_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "rtl", rtl_file)
    try:
        with open(rtl_path) as f:
            # strip the spoiler comments so the model works from evidence
            rtl = "\n".join(l for l in f.read().splitlines()
                            if "BUG" not in l.upper() or "assign" in l)
            rtl = "\n".join(l.split("//")[0].rstrip() if "//" in l else l
                            for l in rtl.splitlines())
    except OSError:
        rtl = "(RTL source unavailable)"

    try:
        from engine.agent_gen import MODEL, client
        msg = client().messages.create(
            model=MODEL,
            max_tokens=500,
            messages=[{"role": "user", "content": (
                f"This hardware design ({design}) failed verification.\n\n"
                f"RTL source:\n```verilog\n{rtl}\n```\n\n"
                f"Smallest failing stimulus (one op per cycle): {json.dumps(minimal_ops)}\n"
                f"At the final cycle the reference model expected "
                f"{json.dumps(mismatch['expected'])} but the DUT produced "
                f"{json.dumps(mismatch['got'])}.\n\n"
                'Respond with ONLY a JSON object, no fences: '
                '{"hypothesis": "<one short paragraph: the most likely cause>", '
                '"fix": {"from": "<the offending RTL line, verbatim>", '
                '"to": "<the corrected line>"} }\n'
                'If you cannot point to a specific line, use "fix": null.'
            )}],
        )
        tokens = msg.usage.input_tokens + msg.usage.output_tokens
        text = msg.content[0].text.strip()
        start, end = text.find("{"), text.rfind("}")
        try:
            parsed = json.loads(text[start:end + 1])
            return {"hypothesis": parsed.get("hypothesis", text),
                    "fix": parsed.get("fix")}, tokens
        except (json.JSONDecodeError, ValueError):
            return {"hypothesis": text, "fix": None}, tokens
    except Exception as e:
        return {"hypothesis": f"(root-cause unavailable: {e})", "fix": None}, 0


def triage(failing_ops, mismatches, dut="buggy", design="fifo_8x8", log=lambda *a: None):
    """Full triage: cluster -> shrink -> root-cause. Returns a bug record."""
    rep = cluster(mismatches)[0]
    minimal = shrink(failing_ops, dut=dut, design=design, log=log)

    # re-run the minimal repro to get its (possibly different) mismatch detail
    out = run_stimulus(minimal, dut=dut, design=design)
    if out["ok"] and out["result"]["mismatches"]:
        rep = out["result"]["mismatches"][0]

    rc, tokens = root_cause(minimal, rep, dut=dut, design=design)
    fields = ", ".join(rep["expected"].keys())
    return {
        "title": f"DUT/reference mismatch on: {fields}",
        "minimal_ops": minimal,
        "minimal_repro": describe_repro(minimal, rep),
        "mismatch": rep,
        "hypothesis": rc["hypothesis"],
        "fix": rc["fix"],
        "tokens": tokens,
    }
