# ── .dockerignore hints ──────────────────────────────────────
# Create a .dockerignore in the backend context root with:
#   __pycache__
#   *.pyc
#   .git
#   .env
#   .venv
#   venv
#   *.egg-info
#   .mypy_cache
#   .pytest_cache
#   uploads/
#   tests/
#   .dockerignore
#   Dockerfile
# ─────────────────────────────────────────────────────────────

# ── Stage 1: Build dependencies ──────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Pin pip version for reproducibility
RUN pip install --no-cache-dir --upgrade pip==25.1.1

# Copy and install Python dependencies into a clean prefix
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: Production image ────────────────────────────────
FROM python:3.12-slim

LABEL maintainer="LawMindAI"
LABEL description="LawMind AI Backend Service"
LABEL version="1.0"
LABEL org.opencontainers.image.title="LawMindAI Backend"
LABEL org.opencontainers.image.vendor="LawMindAI"

WORKDIR /app

# Production environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONHASHSEED=random

# Install runtime dependencies only (curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

# Copy installed Python packages from builder stage
COPY --from=builder /install /usr/local

# Copy application code
COPY . .

# Create upload directory and set ownership
RUN mkdir -p /app/uploads && chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check with curl (lighter than python import)
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
