"""The design registry: everything the engine needs to know per DUT.

The stimulus vocabulary (write / read / write_read / idle / reset) is shared
across designs — each testbench maps it onto its own inputs. That shared
shape is what lets memory patterns learned on one design warm-start the next.
"""

DESIGNS = {
    "fifo_8x8": {
        "toplevel": "fifo",
        "tb_module": "test_fifo",
        "rtl": {"good": "fifo.v", "buggy": "fifo_buggy.v"},
        "points": [
            "wrote_until_full",
            "read_until_empty",
            "simultaneous_read_write",
            "pointer_wraparound",
            "write_while_full",
            "read_while_empty",
        ],
        "point_names": {
            "wrote_until_full": "wrote until full",
            "read_until_empty": "read until empty",
            "simultaneous_read_write": "simultaneous read + write",
            "pointer_wraparound": "pointer wrap-around",
            "write_while_full": "write while full",
            "read_while_empty": "read while empty",
        },
        # cheap-to-deep: boundary probes (fill-to-full, overflow) last
        "priority": [
            "read_until_empty",
            "simultaneous_read_write",
            "pointer_wraparound",
            "read_while_empty",
            "wrote_until_full",
            "write_while_full",
        ],
        "hints": {
            "wrote_until_full": "write until count reaches 8 (DEPTH) without reading",
            "read_until_empty": "after writing some values, read until count returns to 0",
            "simultaneous_read_write": "use write_read while the FIFO is neither full nor empty",
            "pointer_wraparound": "complete more than 8 successful writes (and/or 8 reads) so a pointer wraps past index 7 back to 0",
            "write_while_full": "fill the FIFO completely (8 writes), then issue another write",
            "read_while_empty": "issue a read while the FIFO is empty (count == 0)",
        },
        "system_interface": """The DUT is a synchronous FIFO, WIDTH=8 DEPTH=8:
  inputs:  clk, rst, wr_en, rd_en, din[7:0]
  outputs: dout[7:0], full, empty, count
Writes are ignored when full; reads are ignored when empty.

Op mapping (one op per clock cycle):
  {"op": "reset"}                  rst=1 for one cycle
  {"op": "write", "val": N}        wr_en=1, din=N (0..255)
  {"op": "read"}                   rd_en=1
  {"op": "write_read", "val": N}   wr_en=1 and rd_en=1 in the same cycle
  {"op": "idle"}                   all enables low""",
        "seeds": {
            "read_until_empty":
                [{"op": "reset"}] + [{"op": "write", "val": 32 + i} for i in range(3)]
                + [{"op": "read"}] * 3,
            "simultaneous_read_write":
                [{"op": "reset"}, {"op": "write", "val": 10}]
                + [{"op": "write_read", "val": 20 + i} for i in range(3)]
                + [{"op": "read"}],
            "pointer_wraparound":
                [{"op": "reset"}, {"op": "write", "val": 1}, {"op": "write", "val": 2}]
                + [{"op": "write_read", "val": 64 + i} for i in range(8)]
                + [{"op": "read"}] * 2,
            "read_while_empty":
                [{"op": "reset"}, {"op": "read"}, {"op": "write", "val": 7}, {"op": "read"}],
            "wrote_until_full":
                [{"op": "reset"}] + [{"op": "write", "val": 16 + i} for i in range(8)],
            "write_while_full":
                [{"op": "reset"}] + [{"op": "write", "val": 16 + i} for i in range(8)]
                + [{"op": "write", "val": 99}],
        },
    },

    "rr_arbiter": {
        "toplevel": "arbiter",
        "tb_module": "test_arbiter",
        "rtl": {"good": "arbiter.v"},  # no planted bug — clean design
        "points": [
            "solo_req0_granted",
            "solo_req1_granted",
            "contention",
            "rr_alternation",
            "idle_cycle",
            "grant_after_idle",
        ],
        "point_names": {
            "solo_req0_granted": "solo req0 granted",
            "solo_req1_granted": "solo req1 granted",
            "contention": "simultaneous requests",
            "rr_alternation": "round-robin alternation",
            "idle_cycle": "idle — no grant",
            "grant_after_idle": "grant after idle",
        },
        "priority": [
            "solo_req0_granted",
            "solo_req1_granted",
            "idle_cycle",
            "grant_after_idle",
            "contention",
            "rr_alternation",
        ],
        "hints": {
            "solo_req0_granted": "assert req0 alone (op write) and let it be granted",
            "solo_req1_granted": "assert req1 alone (op read) and let it be granted",
            "contention": "assert both requests in the same cycle (op write_read)",
            "rr_alternation": "hold both requests for several consecutive cycles (write_read repeated) so the grant alternates",
            "idle_cycle": "a cycle with no requests at all (op idle)",
            "grant_after_idle": "an idle cycle followed by a request that gets granted",
        },
        "system_interface": """The DUT is a 2-requester round-robin arbiter:
  inputs:  clk, rst, req0, req1
  outputs: gnt0, gnt1 (registered, one-hot or none)
Solo requester is granted next cycle. Under contention the grant alternates
round-robin. No request -> no grant.

Op mapping (one op per clock cycle; "val" is ignored on this design):
  {"op": "reset"}                  rst=1 for one cycle
  {"op": "write", "val": N}        req0=1
  {"op": "read"}                   req1=1
  {"op": "write_read", "val": N}   req0=1 and req1=1 (contention)
  {"op": "idle"}                   no requests""",
        "seeds": {
            "solo_req0_granted":
                [{"op": "reset"}, {"op": "write", "val": 1}, {"op": "idle"}],
            "solo_req1_granted":
                [{"op": "reset"}, {"op": "read"}, {"op": "idle"}],
            "contention":
                [{"op": "reset"}, {"op": "write_read", "val": 1}, {"op": "idle"}],
            "rr_alternation":
                [{"op": "reset"}] + [{"op": "write_read", "val": 1}] * 4 + [{"op": "idle"}],
            "idle_cycle":
                [{"op": "reset"}, {"op": "idle"}, {"op": "idle"}],
            "grant_after_idle":
                [{"op": "reset"}, {"op": "idle"}, {"op": "write", "val": 1}, {"op": "idle"}],
        },
    },
}


def get(design):
    if design not in DESIGNS:
        raise KeyError(f"unknown design: {design} (have: {list(DESIGNS)})")
    return DESIGNS[design]
