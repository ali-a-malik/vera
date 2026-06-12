#!/usr/bin/env bash
# Vera — one command to run everything.
# Engine (Icarus + cocotb + FastAPI) runs in Docker; the dashboard runs on Vite.
set -euo pipefail
cd "$(dirname "$0")"

./setup-check.sh

# container runtime (colima) up?
if ! docker info >/dev/null 2>&1; then
  echo "→ starting colima (docker runtime)..."
  colima start --cpu 4 --memory 4
fi

echo "→ starting engine container (http://localhost:8000)..."
docker compose up -d --build

# wait for the API
for i in $(seq 1 30); do
  if curl -sf localhost:8000/api/state >/dev/null; then break; fi
  sleep 1
done
curl -sf localhost:8000/api/state >/dev/null || { echo "engine did not come up — check: docker compose logs"; exit 1; }
echo "  engine ready."

if [ ! -d web/node_modules ]; then
  echo "→ installing dashboard deps..."
  (cd web && npm install)
fi

echo "→ starting dashboard (http://localhost:5173)..."
echo ""
echo "  open http://localhost:5173 and press Start."
echo "  (ctrl-c stops the dashboard; 'docker compose down' stops the engine)"
echo ""
(sleep 2 && command -v open >/dev/null && open http://localhost:5173) &
cd web && npm run dev
