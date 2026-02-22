# ═══════════════════════════════════════════════════════════════
#  InSilico ML Backend — Docker Image for Render Deployment
#  Multi-stage build to stay under Render's 512 MB free-tier limit
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Builder ──────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build deps (only in this stage — not shipped)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages into /install so we can copy them cleanly
COPY requirements.prod.txt .
RUN pip install --no-cache-dir --prefix=/install \
    -r requirements.prod.txt gunicorn \
    && find /install -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true \
    && find /install -type d -name 'tests' -exec rm -rf {} + 2>/dev/null || true \
    && find /install -type d -name 'test' -exec rm -rf {} + 2>/dev/null || true \
    && find /install -name '*.dist-info' -exec rm -rf {} + 2>/dev/null || true

# ── Stage 2: Runtime (slim, no build tools) ───────────────────
FROM python:3.11-slim

WORKDIR /app

# Copy only the installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code (respects .dockerignore)
COPY . .

# Render sets PORT env variable automatically (default 10000)
ENV PORT=10000
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE ${PORT}

# Use gunicorn for production (more robust than Flask dev server)
CMD gunicorn --bind 0.0.0.0:${PORT} --workers 2 --timeout 120 --preload "server:app"
