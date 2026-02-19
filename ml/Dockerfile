# ═══════════════════════════════════════════════════════════════
#  InSilico ML Backend — Ultra-Slim for Render Free (512MB)
# ═══════════════════════════════════════════════════════════════

FROM python:3.11-slim

WORKDIR /app

# Minimal system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Ultra-slim requirements (no pandas, no optuna, no edge-tts)
COPY requirements-deploy.txt .
RUN pip install --no-cache-dir -r requirements-deploy.txt gunicorn \
    && rm -rf /root/.cache/pip \
    && find /usr/local/lib/python3.11 -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true \
    && find /usr/local/lib/python3.11 -name '*.pyc' -delete 2>/dev/null || true

# Copy only serving code (no training scripts, no legacy models)
COPY qspr/ ./qspr/
COPY personaplex/ ./personaplex/
COPY models/qspr/ ./models/qspr/
COPY server.py .
COPY descriptors.py .

# Create empty data dir (dataset lookup disabled in LEAN_MODE)
RUN mkdir -p data

ENV PORT=5001
ENV PYTHONUNBUFFERED=1
ENV LEAN_MODE=1
ENV MALLOC_TRIM_THRESHOLD_=65536
ENV PYTHONMALLOC=malloc
# Reduce numpy/scipy thread overhead
ENV OMP_NUM_THREADS=1
ENV MKL_NUM_THREADS=1
ENV OPENBLAS_NUM_THREADS=1

EXPOSE ${PORT}

# Single worker, no preload (saves memory vs fork-then-load)
CMD gunicorn --bind 0.0.0.0:${PORT} --workers 1 --threads 2 --timeout 120 "server:app"
