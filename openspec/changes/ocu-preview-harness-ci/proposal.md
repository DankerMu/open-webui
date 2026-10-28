## Why

(#666.) Found during (#656). Confirmed on OCU `main` `102dbdd`.

**A personal node path in the tests.**

- `tests/orchestrator/test_preview_prefix.py:34-36` picks node from `OCU_TEST_NODE`, then `shutil.which("node")`, then a hard-coded `/Users/danker/.nvm/versions/node/v22.23.2/bin/node`.
- The last fallback works on one machine only and hides a missing node elsewhere.

**The preview embedding browser harness never runs in CI.**

- `tests/orchestrator/preview_embedding_browser.cjs` drives the real workspace SPA in Chromium:
  - terminal start body;
  - refusal display;
  - prefix handling;
  - Office embedding;
  - 503 handling.
- It is documented only as a manual step (`computer-use-server/README.md:507-509`).
- It also reads prepared Draw.io viewer materials (`static/drawio/js/viewer-static.min.js` at `preview_embedding_browser.cjs:4284`, plus stencils, images and `math4`). `computer-use-server/static/drawio/` is gitignored (`.gitignore:85`) and produced only by `computer-use-server/drawio/prepare_drawio.py` (`Dockerfile:39`, `README.md:510`). It needs Playwright 1.62.1 with Chromium, and `OCU_PREVIEW_PYTHON` naming Python 3.12 with the server requirements and pytest (`preview_embedding_browser.cjs:3-4`, `:32-37`).
- The issue proposed adding it to `.github/workflows/build.yml`. On the fork that workflow is `disabled_manually` (`gh workflow list`), because it builds and pushes images, so a job there would never run.
- The workflows that do run on pull requests are lint-only (`identity-lint`, `contracts-lint`, `docs-lint` and others).

## What Changes

**Node lookup.**

- `test_preview_prefix.py` uses `OCU_TEST_NODE`, else `shutil.which("node")`. The personal fallback is removed.
- When neither yields a node, the tests that need it already fail, naming `OCU_TEST_NODE` (`:683-686`, `:1077-1078`, `:1283`). Removing the fallback makes that true on every machine, including the one whose path was hard-coded. Those failure messages stay as they are.

**New workflow `.github/workflows/preview-harness.yml`.** This is a CI-file change, and the PR flags it.

- Trigger: `pull_request` to `main`, filtered to the paths the harness covers:
  - `computer-use-server/static/**`;
  - `computer-use-server/**/*.py`;
  - `computer-use-server/drawio/**`, including `inventory.json`;
  - `computer-use-server/requirements.txt`;
  - `tests/orchestrator/preview_embedding_browser.cjs`;
  - `tests/orchestrator/_preview_capture.py`;
  - `tests/orchestrator/test_preview_prefix.py` (`_preview_capture.py:14` imports from it);
  - the workflow itself.

  Also `workflow_dispatch`.

- One job on `ubuntu-latest`, `permissions: contents: read`, `timeout-minutes: 30`. Actions are pinned by SHA as in the other workflows:
  - `actions/checkout@3d3c42e…`;
  - `actions/setup-python@5fda3b9…`, Python 3.12;
  - `actions/setup-node@48b55a0…`, Node 22.
- Steps:
  1. A Python 3.12 venv with `computer-use-server/requirements.txt` (pytest is already in it). `_preview_capture.py:38` refuses any other Python version.
  2. `python computer-use-server/drawio/prepare_drawio.py` with that venv. It downloads from `codeload.github.com`, pinned by SHA-256, so the result is deterministic.
  3. Playwright installed at exactly 1.62.1 without the repository's full `package.json` dependency set (no lockfile exists, and the set pulls heavy unrelated packages). For example, `npm install --no-save --no-package-lock playwright@1.62.1` in a scratch prefix, with `NODE_PATH` pointing at it.
  4. `node <prefix>/node_modules/playwright/cli.js install --with-deps chromium`. This needs apt and network access.
  5. `node tests/orchestrator/preview_embedding_browser.cjs` from the repository root, with `OCU_PREVIEW_PYTHON` set to the venv's python.
  6. On failure, upload `OCU_PREVIEW_ARTIFACTS` as a workflow artifact. The workflow sets it to a fixed path; unset, the harness writes to a random temp directory (`preview_embedding_browser.cjs:763`).
- No secrets, no image builds, no pushes.

**Docs.** `computer-use-server/README.md:507-509` adds that the `preview-harness` workflow runs the harness on pull requests.

Deviation from the issue: the harness runs in a new workflow, not in `build.yml`, because `build.yml` is disabled on the fork.

**If the first CI run fails.** The harness has never run on Linux or in CI.

- A failure from the environment (missing system packages, timing on the runner) is fixed in this PR.
- A real SPA regression gets its own issue.
- No harness check is weakened or skipped to get green.

## Capabilities

### Modified Capabilities

- `ocu-preview-spa`: one added requirement, that the real-SPA harness runs on every relevant pull request.

## Impact

- OCU:
  - `tests/orchestrator/test_preview_prefix.py`;
  - `.github/workflows/preview-harness.yml` (new);
  - `computer-use-server/README.md`.
- design.md is omitted at the compact level.
- Non-goals:
  - new harness scenarios;
  - re-enabling `build.yml`;
  - running the other orchestrator pytest suites in CI;
  - the VPS acceptance scripts.

## Fixture

```text
Issue type: test
Fixture level: compact
Upstream suggested level: absent; compact: no runtime behaviour changes; a test helper and an added CI workflow
Blast radius: a CI job that fails for environment reasons and blocks PRs; a node lookup that skips instead of failing
Selected risk packs: Config / project setup (new workflow, pinned toolchain, Draw.io preparation with its pinned download); Release / packaging / dependency compatibility (Playwright pinned at 1.62.1); Resource limits (job timeout); Documentation (README)
Not selected: Public API (none); Auth / secrets (workflow uses no secrets, read-only token); Error handling (test-only); Legacy compatibility (no runtime change); Concurrency, File IO, Schema (none)
Evidence floor: `git grep -n '/Users/' tests` empty; test_preview_prefix with node removed from PATH fails naming OCU_TEST_NODE; the harness passes locally after deleting computer-use-server/static/drawio/ and running the prepare step; the new workflow runs on the OCU PR and passes on its head, its log showing the prepare step and playwright@1.62.1
design.md: omitted (compact)
```
