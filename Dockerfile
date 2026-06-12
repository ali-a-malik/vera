# stage 1: build the dashboard
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

# stage 2: the engine (simulator + agents + server), serving the built UI
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    iverilog make gcc g++ \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    cocotb==1.9.2 \
    anthropic \
    fastapi \
    "uvicorn[standard]"

WORKDIR /app
COPY rtl/ rtl/
COPY tb/ tb/
COPY engine/ engine/
COPY server.py ./
COPY --from=web /web/dist web/dist

EXPOSE 8000
CMD ["python", "server.py"]
