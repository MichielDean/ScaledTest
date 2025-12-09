# Playwright Test Runner for K8s Platform
# Supports test discovery, indexed execution, CTRF output, and artifact management
#
# OPTIMIZATION NOTES:
# - Uses Ubuntu base + manual Chromium installation (saves ~1.5GB vs full playwright image)
# - Multi-stage build to minimize final image size
# - Only Chromium browser (tests only use chromium project)
# - Pruned npm cache and dev dependencies where possible

# =============================================================================
# Stage 1: Dependency Installation
# =============================================================================
FROM ubuntu:24.04 AS deps

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js 20.x (matches playwright requirements)
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node.js dependencies first (better layer caching)
COPY frontend/package*.json ./
RUN npm ci --ignore-scripts

# Install CTRF Playwright reporter
RUN npm install --save-dev playwright-ctrf-json-reporter

# Install ONLY Chromium browser (not Firefox/WebKit - saves ~1.5GB)
RUN npx playwright install chromium --with-deps

# Clean up npm cache to reduce image size
RUN npm cache clean --force

# =============================================================================
# Stage 2: Final Runtime Image
# =============================================================================
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js runtime and minimal dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    jq \
    # Chromium runtime dependencies
    libasound2t64 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xvfb \
    fonts-liberation \
    fonts-noto-color-emoji \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# Copy installed dependencies from build stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /root/.cache/ms-playwright /root/.cache/ms-playwright

# Copy frontend source code (needed for tests)
COPY frontend/ ./

# Copy K8s-specific playwright config
COPY containers/base-images/playwright-runner/playwright.k8s.config.ts ./

# Copy ScaledTest client library
COPY containers/shared/scaledtest-client /scaledtest-client/
RUN chmod +x /scaledtest-client/client.sh

# Copy runner scripts
COPY containers/base-images/playwright-runner/scripts/ /scripts/
RUN chmod +x /scripts/*.sh

# Set environment variables
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright
ENV TEST_RESULTS_DIR=/test-results
ENV ARTIFACTS_DIR=/artifacts
ENV CTRF_OUTPUT=/test-results/ctrf-report.json

# Create required directories
RUN mkdir -p $TEST_RESULTS_DIR $ARTIFACTS_DIR

# Entry point script handles discovery or execution mode
ENTRYPOINT ["/scripts/entrypoint.sh"]
