# ═══════════════════════════════════════════════════════════════
#  InSilico ML Backend — Docker Image for Render Deployment
#  Aggressively optimized for Render's 512 MB free-tier limit
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
RUN pip install --no-cache-dir --no-compile --prefix=/install \
    -r requirements.prod.txt gunicorn \
    && find /install -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true \
    && find /install -type d -name 'tests'      -exec rm -rf {} + 2>/dev/null || true \
    && find /install -type d -name 'test'        -exec rm -rf {} + 2>/dev/null || true \
    && find /install -name '*.dist-info'         -exec rm -rf {} + 2>/dev/null || true \
    && find /install -name '*.pyi'               -delete 2>/dev/null || true \
    && find /install -name '*.pyx'               -delete 2>/dev/null || true \
    && find /install -name '*.c'                 -delete 2>/dev/null || true \
    && find /install -name '*.h'                 -delete 2>/dev/null || true \
    && find /install -name '*.txt'               -delete 2>/dev/null || true \
    && find /install -name '*.md'                -delete 2>/dev/null || true \
    && find /install -name '*.rst'               -delete 2>/dev/null || true

# ── Stage 2: Runtime (slim, no build tools) ───────────────────
FROM python:3.11-slim

WORKDIR /app

# Copy only the installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code (respects .dockerignore)
COPY . .

# ── Memory-optimized environment ──
# Render sets PORT env variable automatically (default 10000)
ENV PORT=10000
ENV PYTHONUNBUFFERED=1
# Prevent Python from caching bytecode (saves disk/memory)
ENV PYTHONDONTWRITEBYTECODE=1
# Only load XGBoost models, skip RandomForest + legacy + ADMET
ENV LOW_MEMORY=1
# Aggressive glibc malloc trimming — returns freed memory to OS faster
ENV MALLOC_TRIM_THRESHOLD_=65536
ENV MALLOC_MMAP_THRESHOLD_=65536
# Limit numpy/scikit-learn thread usage (saves ~50MB per extra thread)
ENV OMP_NUM_THREADS=1
ENV OPENBLAS_NUM_THREADS=1
ENV MKL_NUM_THREADS=1
ENV NUMEXPR_NUM_THREADS=1

# Expose port
EXPOSE ${PORT}

# ── Production server ──
# 1 worker + 2 threads = handles concurrency without duplicating memory
# --max-requests 200  = auto-restart workers to reclaim leaked memory
# --max-requests-jitter 50 = stagger restarts
# --preload = share model memory across worker forks
CMD gunicorn \
    --bind 0.0.0.0:${PORT} \
    --workers 1 \
    --threads 2 \
    --worker-class gthread \
    --timeout 120 \
    --max-requests 200 \
    --max-requests-jitter 50 \
    --preload \
    "server:app"
