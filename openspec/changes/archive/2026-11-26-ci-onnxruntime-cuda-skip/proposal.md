## Why

Every cold `npm ci` on Linux x64 runs `onnxruntime-node`'s install script.

- **The dependency.** `@huggingface/transformers` 3.8.1 (`package.json:66`, used by `src/lib/workers/kokoro.worker.ts`) has a hard dependency on `onnxruntime-node` 1.21.0. The dependency is inherited from upstream Open WebUI.
- **The script.** `node_modules/onnxruntime-node/script/install.js:61` downloads the CUDA execution provider from GitHub releases whenever the CUDA `.so` is absent and no skip flag is set.
- **The failure.** Since 2026-11-23 the asset returns HTTP 404, and `npm ci` fails:
  - the liveness workflow's Guardrail self-test failed in run 45222368045 (schedule) and run 45646116246 (PR);
  - `ci.yml` is masked only by its `node_modules` cache hit;
  - the image build's `npm ci --force` in `node:22-alpine3.20` on amd64 is exposed the same way.

This change closes (#918).

## What Changes

Each active Linux Node install site sets `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`. `install.js:46-63` reads that variable first, and on `skip` exits 0 before any download. Each setting carries an inline comment naming the 404. The sites are:

- **`.github/workflows/agents-md-liveness.yml`:** job-level `env:` on the `guardrail-self-test` job. This covers its `npm ci`, and any `npm install --force` from the `hatch_build.py` build hook that a `uv` sync in `scripts/test-guardrails.sh` reaches.
- **`.github/actions/setup-toolchain/action.yml`:** the cache-miss `npm ci` step.
- **`Dockerfile`:** an `ENV` in the `build` stage, before `npm ci --force`.
- **`Makefile`:** a target-specific `export` on `setup`. This covers both recipe lines: `uv sync --frozen --group dev`, whose editable install of the project runs the build hook's `npm install --force` (`uv.lock` lists `open-webui` as `editable = "."`), and `npm ci`.

The CUDA execution provider is never used. The only importer of `@huggingface/transformers` is a browser worker, which resolves to `onnxruntime-web`.

## Capabilities

### New Capabilities

- `ci-node-install`: Node installs never fetch optional GPU binaries at install time.

### Modified Capabilities

None.

## Impact

- **Changed:** two CI files, the `Dockerfile` and the `Makefile`. The PR flags the CI change, as AGENTS.md requires.
- **Not changed:**
  - `package.json` and the lockfile. No dependency changes.
  - `.npmrc`. Its project-config route does not reach the image build, which copies only the manifests, and npm 10 warns on unknown keys.
  - The manually disabled upstream workflows `frontend.yaml`, `docker.yaml` and `release-pypi.yml`. They are kept as is to keep the upstream diff minimal; `docker.yaml` builds the `Dockerfile`, which carries the `ENV` itself.

## Triage

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent (issue says Size S); expanded because setup-toolchain and make setup are shared entrypoints
Blast radius: every Linux Node install (CI, liveness, image build, make setup) fails or keeps failing
Selected risk packs: Config / project setup; Release / packaging / dependency compatibility
Evidence floor: red-then-green npm ci in node:22-alpine3.20 amd64; liveness green on the PR; PR CI green after a forced node_modules cache miss
```
