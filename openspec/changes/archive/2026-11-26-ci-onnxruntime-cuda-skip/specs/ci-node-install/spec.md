## ADDED Requirements

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
