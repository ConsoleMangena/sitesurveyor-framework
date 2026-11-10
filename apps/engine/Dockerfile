# ==============================================================================
# SiteSurveyor AI — Production Dockerfile for Render / Cloud Deployment
# ==============================================================================
# 3.14, not 3.11: pyproj and rasterio both require Python >=3.12 since the releases whose
# bundled PROJ data agree with each other. On 3.11 pip silently resolves the older pair,
# where rasterio's vendored libproj rejects pyproj's proj.db
# ("DATABASE.LAYOUT.VERSION.MINOR = 4 whereas a number >= 6 is expected") and every CRS
# lookup fails at import. The image now takes the same wheels the test suite runs against.
FROM python:3.14-slim

# Avoid prompts from debian frontends
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
# Survey cache + published deliverables. Point this at a mounted disk in production; on a
# plain `docker run` it simply lives inside the container and is lost with it.
ENV SITESURVEYOR_STATE_DIR=/app/state
# Coverages are read as remote COGs; without this GDAL lists the whole S3 prefix
# on every open, which turns each layer read into a multi-second stall.
ENV GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR
# Strict memory caps to prevent OOM on 512MB RAM cloud tiers
ENV GDAL_CACHEMAX=32
ENV MAP_DPI=90
ENV MALLOC_TRIM_THRESHOLD_=65536

# Install runtime dependencies.
# libexpat1 is not optional: the manylinux rasterio wheel vendors GDAL/PROJ, whose
# SQLite-backed coordinate-database load links against libexpat.so.1. python:*-slim
# does not ship it, so "import rasterio" raises ImportError in the container and the
# worker dies on startup before it has claimed a single job.
# No proj-data package: both wheels ship their own PROJ database, and src/config.py
# points PROJ_DATA at pyproj's copy, so a system dataset (Debian trixie's is layout 5)
# would only add a third version for the two libraries to disagree about.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    libgomp1 \
    libexpat1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifest and install Python wheels
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code and configurations
COPY src/ ./src/
COPY data/ ./data/
COPY main.py worker.py ./

# Create persistent cache & outputs directories
RUN mkdir -p /app/state/data/raw /app/state/data/external /app/state/outputs && \
    (cp -rn /app/data/external/* /app/state/data/external/ 2>/dev/null || true)

# Import the worker once during the build. A missing shared library or module otherwise
# surfaces only as a restarting service that never claims a job, with the traceback buried
# in runtime logs; this turns it into a build failure that names the missing piece. The
# entrypoint runs exactly this module, so checking it is what proves the image can work.
RUN python -c "import worker; print('worker imports clean')"

# No EXPOSE and no health check: this service listens on nothing. Render watches whether
# the process stays up, and a job that stops being claimed is the real failure signal --
# which is why the claim loop logs every attempt it makes and every row it takes.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

