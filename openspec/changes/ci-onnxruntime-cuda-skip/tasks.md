## 1. Skip the CUDA download (#918)

- [ ] 1.1 Set `ONNXRUNTIME_NODE_INSTALL_CUDA=skip` at the four active Linux Node install sites, each with an inline comment naming the onnxruntime GitHub release 404 (#918). Verify that a cold `npm ci` in `node:22-alpine3.20` on amd64 fails without it and passes with it, and that the liveness workflow passes on the PR branch.

  **Task 1.1 required evidence** (issue #918):
  - **Fixture level:** expanded. `setup-toolchain` and `make setup` are shared entrypoints. `design.md` names the sibling surfaces.
  - **Risk packs:**
    - **Config / project setup:** selected. The liveness job, every `ci.yml` job that uses `setup-toolchain` with `node: 'true'`, and `make setup` for Linux developers.
    - **Release / packaging / dependency compatibility:** selected. The image's `build` stage runs `npm ci --force`. No dependency or lockfile changes.
    - **Documentation / migration notes:** not selected. AGENTS.md's lockfile-conflict advice is a developer shell command; see `design.md`.
    - Every other pack is not selected. There is no application code.
  - **Shape.**
    - **`.github/workflows/agents-md-liveness.yml`:** the `guardrail-self-test` job gains a job-level `env:` with `ONNXRUNTIME_NODE_INSTALL_CUDA: skip` and the comment.
    - **`.github/actions/setup-toolchain/action.yml`:** the cache-miss `npm ci` step gains a step `env:` with the same variable and the comment.
    - **`Dockerfile`:** one comment line and `ENV ONNXRUNTIME_NODE_INSTALL_CUDA=skip`, placed directly before `RUN npm ci --force` in the `build` stage. Nothing else in the file changes.
    - **`Makefile`:** a comment line and `setup: export ONNXRUNTIME_NODE_INSTALL_CUDA := skip`, above the `setup:` rule. The rule's recipe is unchanged.
  - **Must preserve:** see `design.md`. The code PR's `git diff --stat` shows exactly these four files.
  - **Required evidence.**
    1. **Red, then green, on the image's base.** Copy `package.json` and `package-lock.json` into `docker run --platform linux/amd64 node:22-alpine3.20` and run `npm ci --force`:
       - **Red:** without the variable, the log shows `Downloading "https://github.com/microsoft/onnxruntime` and `npm ci` fails. The cause, the 404 today or a 504 another day, is recorded as the log gives it.
       - **Green:** with `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`, there is no such line and the exit code is 0.
    2. **Makefile.** Put stub `uv` and `npm` executables first on `PATH`; each runs `printenv ONNXRUNTIME_NODE_INSTALL_CUDA; exit 0`. Then run `PATH=<stubdir>:$PATH make setup`.
       - **Green:** every stub call prints `skip`. That covers `uv sync`, `npm ci` and `uv run pre-commit install`.
       - **Red:** the same run with `export` removed from the target-specific line prints nothing, and `printenv` fails.
       - A real `make setup` on Linux stays review-only. The PR says so.
    3. **Liveness.** The code PR touches `Makefile`, which is in the liveness `pull_request` path filter, so the workflow runs on the PR:
       - its Guardrail self-test job passes;
       - its `npm ci` step log has no onnxruntime `Downloading` line.
    4. **A cold `ci.yml` install.**
       - Delete every `node-modules-` cache entry with `gh cache delete` before the code branch's first push, when no other CI run is active. Delete the entries scoped to `main` and to any PR ref.
       - Deleting the `main` entry makes other runs install cold until this fix merges, so do it while nothing else runs.
       - `setup-toolchain` then runs `npm ci` cold. That run's `npm ci` log has no onnxruntime `Downloading` line, and `All checks passed` is green.
    5. **Not run:** a full `docker build`. Evidence 1 covers its `npm ci` layer on the same base image and platform.
    6. **The PR** flags the CI change. It states that no decision record is needed, because under AGENTS.md § Decision records this is a trivial, environment-only configuration change.
  - **Non-goals:**
    - removing or upgrading `@huggingface/transformers` or `onnxruntime-node`;
    - `.npmrc`;
    - the disabled `frontend.yaml`, `docker.yaml` and `release-pypi.yml`;
    - macOS;
    - AGENTS.md.

Suggested fixture level: expanded - four configuration lines with comments, two of them on shared entrypoints.
Minimal mergeable slice: atomic - one setting at four sites.
