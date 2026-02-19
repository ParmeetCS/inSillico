# ═══════════════════════════════════════════════════════════════
#  InSilico ML Backend — Docker Image for Railway Deployment
# ═══════════════════════════════════════════════════════════════

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for RDKit
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copy the entire ML directory
COPY . .

# Railway sets PORT env variable automatically
ENV PORT=5001
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE ${PORT}

# Use gunicorn for production (more robust than Flask dev server)
CMD gunicorn --bind 0.0.0.0:${PORT} --workers 2 --timeout 120 --preload "server:app"
