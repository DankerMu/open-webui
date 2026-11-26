## Design

- **Change surface.**
  - `.github/workflows/agents-md-liveness.yml`, job `guardrail-self-test`;
  - `.github/actions/setup-toolchain/action.yml`, its cache-miss `npm ci` step;
  - the `Dockerfile` `build` stage;
  - the `Makefile` `setup` target.
- **Must preserve.**
  - Every other step, key, condition, cache key and permission in the two CI files.
  - Every other line of the `Dockerfile` and the `Makefile`.
  - The installed `node_modules` tree is the same, because CI and the image never held the CUDA `.so`. That is also why the `node-modules-` cache key does not change.
- **Must add.** `ONNXRUNTIME_NODE_INSTALL_CUDA=skip` in the environment of every Linux Node install at the four sites. Each setting carries an inline comment naming the onnxruntime GitHub release 404 (#918).
- **Governing invariant.** No Node install this repository runs on Linux fetches an optional GPU binary at install time.
- **Sibling surfaces.**
  - **The `hatch_build.py` build hook** (`npm install --force`). It is reached by `uv sync` without `--no-install-project`: by `make setup`, covered by the target-specific export, and by any `uv run --project` sync in the liveness job, covered by the job-level `env:`. `ci.yml` syncs with `--no-install-project` (`ci.yml:21-27`), so it never reaches the hook.
  - **`release-pypi.yml`** (`python -m build .` runs the hook) and **`docker.yaml`**: both disabled manually. Non-goals.
  - **`frontend.yaml`** (`npm ci --force`): disabled. Non-goal.
  - **AGENTS.md's lockfile-conflict advice** ("re-run `uv sync` / `npm install`"). It is a developer shell command, not a site this repository runs. On Linux x64 a bare `npm install` without `make setup` can hit the 404, and the install script's own error names the `--onnxruntime-node-install-cuda=skip` flag. Documentation pack: not selected.
- **Seams under test.** The `npm ci` process environment at each site.
- **Required evidence.** See task 1.1.
- **Non-goals.**
  - Dependency changes.
  - `.npmrc`.
  - The disabled workflows.
  - macOS, where `IS_LINUX_X64` is false.
  - Editing AGENTS.md.
- **Review focus.**
  1. The variable reaches each install: job-level `env:`, a composite step's `env:`, Docker `ENV` order, and a Makefile target-specific `export`.
  2. No other line changes.
  3. The comments name the failure mode.
