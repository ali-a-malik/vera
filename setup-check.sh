#!/usr/bin/env bash
# Verifies everything Vera needs is present. Exits non-zero on hard failures.
set -uo pipefail
cd "$(dirname "$0")"
fail=0

ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
bad()  { printf "  \033[31m✗\033[0m %s\n" "$1"; fail=1; }
warn() { printf "  \033[33m!\033[0m %s\n" "$1"; }

echo "vera setup check:"

command -v docker >/dev/null && ok "docker cli ($(docker --version | cut -d, -f1))" \
  || bad "docker cli missing — brew install colima docker docker-compose"
command -v colima >/dev/null && ok "colima" \
  || warn "colima missing (fine if another docker runtime is running)"
command -v node >/dev/null && ok "node $(node --version)" \
  || bad "node missing — install Node LTS"
command -v npm >/dev/null && ok "npm $(npm --version)" \
  || bad "npm missing"

# API key: env var or .env file (the engine reads it inside the container)
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  ok "ANTHROPIC_API_KEY (env)"
elif [ -f .env ] && grep -q '^ANTHROPIC_API_KEY=..*' .env; then
  ok "ANTHROPIC_API_KEY (.env)"
else
  warn "no ANTHROPIC_API_KEY — the loop still runs on fallback seed tests;"
  warn "  AI generation + root-cause need it. Put it in .env (gitignored):"
  warn "  ANTHROPIC_API_KEY=sk-ant-..."
fi

# iverilog/cocotb/python live inside the image — only checked when daemon is up
if docker info >/dev/null 2>&1; then
  if docker image inspect vera-engine >/dev/null 2>&1; then
    ok "vera-engine image (iverilog + cocotb + python inside)"
  else
    warn "vera-engine image not built yet — run.sh builds it on first start"
  fi
else
  warn "docker daemon not running — run.sh starts colima automatically"
fi

[ $fail -eq 0 ] && echo "  all required checks passed." || echo "  fix the ✗ items above."
exit $fail
