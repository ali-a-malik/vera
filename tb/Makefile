# cocotb + Icarus.
#   make DESIGN=fifo DUT=buggy     (defaults: DESIGN=fifo, DUT=good)
#   make DESIGN=arbiter
SIM ?= icarus
TOPLEVEL_LANG ?= verilog

DESIGN ?= fifo
DUT ?= good

ifeq ($(DESIGN),arbiter)
VERILOG_SOURCES = $(PWD)/../rtl/arbiter.v
TOPLEVEL = arbiter
MODULE = test_arbiter
else
ifeq ($(DUT),buggy)
VERILOG_SOURCES = $(PWD)/../rtl/fifo_buggy.v
else
VERILOG_SOURCES = $(PWD)/../rtl/fifo.v
endif
TOPLEVEL = fifo
MODULE = test_fifo
endif

# separate build dirs so switching DESIGN/DUT never reuses a stale binary
SIM_BUILD = sim_build_$(DESIGN)_$(DUT)

# let the testbench import engine/ (checker, coverage model)
export PYTHONPATH := $(PWD)/..:$(PYTHONPATH)

include $(shell cocotb-config --makefiles)/Makefile.sim
