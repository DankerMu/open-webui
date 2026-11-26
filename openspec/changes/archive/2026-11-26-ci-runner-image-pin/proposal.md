## Why

The CI jobs that install the runtime toolchain broke when GitHub moved `ubuntu-latest` to ubuntu-26.04.

- **Last green CI run:** 43447779019 on 2026-11-13, on `Image: ubuntu-24.04`. In that run, `.github/actions/setup-toolchain` step "Install hurl and native nginx with auth_request" succeeded.
- **First red run:** 43862311473 on 2026-11-16, on `Image: ubuntu-26.04`. The same step failed with exit code 100:

  ```
  hurl : Depends: libxml2 but it is not installable
  nginx module version conflicts
  ```

  Excluding docs, the repository did not change between the two runs. The runner image is the only variable.

- **Affected jobs:** Runtime smoke and the three Browser verification shards, the four jobs that use `runtime: 'true'`. They fail before they read any repository code.
- **Consequence:** `main` has been red since 2026-11-16. The required check "All checks passed" cannot pass for any non-docs PR. #916 (the #851 OCU pin) is blocked (#917).

## What Changes

- Every job in `.github/workflows/ci.yml` runs on `ubuntu-24.04` instead of `ubuntu-latest`. Each changed line carries an inline comment naming the 26.04 nginx/hurl apt failure (#917).
- **The two `agents-md-liveness.yml` jobs also run on `ubuntu-24.04`.**
  - That workflow does not install nginx or hurl. It reuses the uv cache that ci.yml warms (`setup-toolchain` lines 63–64; liveness lines 32–33).
  - The cache key contains the image name, so running on a different image than ci.yml means a cold cache.
  - Their comments name that coupling.
- `constraints.yaml` `ci.matrix`, the machine-readable source of truth, changes from `ubuntu-latest, python 3.12, node 20` to `ubuntu-24.04, python 3.12, node 22`. The Node version on that line was already stale.

## Capabilities

### New Capabilities

- `ci-runner-image`: CI jobs run on a named runner image, not a moving alias.

### Modified Capabilities

None.

## Impact

- **Changed:** CI files and one `constraints.yaml` line. The PR flags the CI change, as AGENTS.md requires.
- **Not changed:**
  - The release workflows (`release.yml`, `release-pypi.yml`).
  - The disabled upstream workflows `backend.yaml`, `frontend.yaml`, `regression.yaml`, `issue-label.yaml` and `docker.yaml`. They are left as they are to keep the upstream diff minimal.
  - The toolchain install steps.
- **Separate issue:** the `onnxruntime-node` GPU download 404 during `npm ci` (#918). It fails the liveness workflow now. It is latent in ci.yml, which skips `npm ci` only while its `node_modules` cache hits.
- **First runs:** the first runs on 24.04 rebuild the image-keyed uv cache cold.
- **Moving to a newer image later** is a deliberate change: edit the pin and port the install.
