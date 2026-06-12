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

EXPOSE 8000
CMD ["python", "server.py"]
