# ═══════════════════════════════════════════════════════════════
#  InSilico ML Backend — Optimized for Render Free Tier (512MB)
# ═══════════════════════════════════════════════════════════════

FROM python:3.11-slim

WORKDIR /app

# Install only essential system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Use slim deployment requirements (no optuna, edge-tts, etc.)
COPY requirements-deploy.txt .
RUN pip install --no-cache-dir -r requirements-deploy.txt gunicorn \
    && rm -rf /root/.cache/pip

# Copy only what's needed for serving (skip training scripts)
COPY qspr/ ./qspr/
COPY personaplex/ ./personaplex/
COPY models/ ./models/
COPY data/ ./data/
COPY server.py .
COPY descriptors.py .

# Railway/Render set PORT env variable automatically
ENV PORT=5001
ENV PYTHONUNBUFFERED=1
ENV LEAN_MODE=1
# Reduce memory: tell Python to be frugal
ENV MALLOC_TRIM_THRESHOLD_=65536
ENV PYTHONMALLOC=malloc

EXPOSE ${PORT}

# Single worker + threads to stay under 512MB
CMD gunicorn --bind 0.0.0.0:${PORT} --workers 1 --threads 2 --timeout 120 --preload "server:app"
