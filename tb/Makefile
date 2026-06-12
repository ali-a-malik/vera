# cocotb + Icarus. Select DUT with `make DUT=buggy` (default: good).
SIM ?= icarus
TOPLEVEL_LANG ?= verilog

DUT ?= good
ifeq ($(DUT),buggy)
VERILOG_SOURCES = $(PWD)/../rtl/fifo_buggy.v
else
VERILOG_SOURCES = $(PWD)/../rtl/fifo.v
endif

TOPLEVEL = fifo
MODULE = test_fifo

# separate build dirs so switching DUT never reuses a stale binary
SIM_BUILD = sim_build_$(DUT)

# let the testbench import engine/ (checker, coverage model)
export PYTHONPATH := $(PWD)/..:$(PYTHONPATH)

include $(shell cocotb-config --makefiles)/Makefile.sim
