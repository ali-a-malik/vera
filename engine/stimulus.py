"""The stimulus data contract: a test is a JSON list of ops, one per cycle.

  {"op": "reset"} | {"op": "write", "val": N} | {"op": "read"}
  | {"op": "write_read", "val": N} | {"op": "idle"}
"""

VALID_OPS = {"reset", "write", "read", "write_read", "idle"}


class StimulusError(ValueError):
    pass


def validate(ops):
    """Validate a stimulus list; returns the normalized list or raises
    StimulusError with a message suitable for feeding back to the model."""
    if not isinstance(ops, list):
        raise StimulusError(f"stimulus must be a JSON array, got {type(ops).__name__}")
    if not ops:
        raise StimulusError("stimulus list is empty")
    if len(ops) > 2000:
        raise StimulusError(f"stimulus too long ({len(ops)} ops, max 2000)")
    out = []
    for i, item in enumerate(ops):
        if not isinstance(item, dict) or "op" not in item:
            raise StimulusError(f'item {i} must be an object with an "op" key, got {item!r}')
        op = item["op"]
        if op not in VALID_OPS:
            raise StimulusError(f'item {i}: unknown op "{op}" (valid: {sorted(VALID_OPS)})')
        norm = {"op": op}
        if op in ("write", "write_read"):
            val = item.get("val", 0)
            if not isinstance(val, int) or not (0 <= val <= 255):
                raise StimulusError(f'item {i}: "val" must be an integer 0..255, got {val!r}')
            norm["val"] = val
        out.append(norm)
    return out


def to_signals(op):
    """Map one op to the DUT input signals for that cycle."""
    name = op["op"]
    return {
        "rst": name == "reset",
        "wr_en": name in ("write", "write_read"),
        "rd_en": name in ("read", "write_read"),
        "din": op.get("val", 0),
    }
