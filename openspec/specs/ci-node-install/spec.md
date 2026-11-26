# ci-node-install Specification

## Purpose

Node installs that this repository runs on Linux never fetch an optional GPU binary at install time. `onnxruntime-node`'s CUDA execution provider download from GitHub releases is skipped, because that asset can disappear (404 since 2026-11-23, #918) and nothing here loads it.

## Requirements

### Requirement: Node installs skip the onnxruntime-node CUDA download

The following Node installs SHALL run with `ONNXRUNTIME_NODE_INSTALL_CUDA=skip` in their environment:

- the liveness workflow's `guardrail-self-test` job, set at job level;
- the `setup-toolchain` action's cache-miss `npm ci`;
- the `Dockerfile` `build` stage's `npm ci --force`;
- every recipe line of `make setup`, including `uv sync` (whose build hook runs `npm install --force`) and `npm ci`.

Each setting SHALL carry an inline comment naming the GitHub release 404 it avoids. The manually disabled upstream workflows (`frontend.yaml`, `docker.yaml`, `release-pypi.yml`) are excluded. This rule is review-only: no script checks it.

#### Scenario: The CUDA release asset is unavailable

- **WHEN** a covered install runs on Linux x64 and the onnxruntime CUDA release asset cannot be downloaded
- **THEN** `onnxruntime-node`'s install script exits 0 without trying the download, and the install succeeds
