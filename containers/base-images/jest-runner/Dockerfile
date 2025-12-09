# ScaledTest Jest Runner Base Image
# Users build atop this image with their test code

FROM node:20-alpine

LABEL maintainer="ScaledTest <support@scaledtest.io>"
LABEL description="Base image for running Jest tests in ScaledTest platform"
LABEL org.opencontainers.image.source="https://github.com/MichielDean/ScaledTest"

WORKDIR /app

# Install base dependencies for test execution
RUN apk add --no-cache \
    bash \
    curl \
    git \
    && npm install -g npm@latest

# Copy package files for base dependencies
COPY package.json package-lock.json ./
RUN npm ci --production=false

# Copy test discovery and execution scripts
COPY scripts/list-tests.js /app/list-tests
COPY scripts/run-test.js /app/run-test
RUN chmod +x /app/list-tests /app/run-test

# Copy CTRF stream reporter
COPY reporters/ctrf-stream-reporter.js /app/reporters/ctrf-stream-reporter.js

# Create directories for user content
RUN mkdir -p /app/tests /app/fixtures /app/config

# Environment variables with defaults
ENV NODE_ENV=test
ENV TEST_TIMEOUT=30000
ENV UPLOAD_FREQUENCY="10,30s"

# Default command runs a test
ENTRYPOINT ["/app/run-test"]
CMD ["--help"]
