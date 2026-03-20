FROM python:3.13-slim

WORKDIR /app
COPY services/orchestrator ./services/orchestrator

RUN python -m pip install --upgrade pip
RUN python -m pip install -e /app/services/orchestrator

WORKDIR /app/services/orchestrator
CMD ["python", "-m", "content_engine_x_orchestrator.api"]
