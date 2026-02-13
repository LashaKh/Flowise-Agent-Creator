# PersonaHub Desktop — Sandbox Container
#
# A minimal, isolated environment for running shell commands from AI personas.
# Used by security/docker-sandbox.ts when sandboxEnabled = true.
#
# Key properties:
# - Alpine-based (small footprint, ~50MB)
# - Common dev tools pre-installed
# - No network access at runtime (enforced by docker run --network none)
# - Runs as non-root user for extra safety
#
# Build:  docker build -t personahub-sandbox:latest .
# The app builds this automatically via ensureSandboxImage() if not present.

FROM alpine:3.19

# Install common dev tools personas might need
RUN apk add --no-cache \
    bash \
    python3 \
    nodejs \
    npm \
    git \
    curl \
    jq \
    coreutils

# Create non-root user for execution
RUN adduser -D -h /home/sandbox sandbox

# Output directory (mounted read-write at runtime)
RUN mkdir -p /output && chown sandbox:sandbox /output
WORKDIR /output

USER sandbox
