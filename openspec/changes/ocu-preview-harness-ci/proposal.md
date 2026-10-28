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
- It is documented only as a manual step (`computer-use-server/README.md:507-509`). It needs Playwright 1.62.1 with Chromium, and `OCU_PREVIEW_PYTHON` naming Python 3.12 with the server requirements and pytest (`preview_embedding_browser.cjs:3-4`, `:31-36`).
- The issue proposed adding it to `.github/workflows/build.yml`. On the fork that workflow is `disabled_manually` (`gh workflow list`), because it builds and pushes images, so a job there would never run.
- The workflows that do run on pull requests are lint-only (`identity-lint`, `contracts-lint`, `docs-lint` and others).

## What Changes

**Node lookup.**

- `test_preview_prefix.py` uses `OCU_TEST_NODE`, else `shutil.which("node")`. The personal fallback is removed.
- When neither yields a node, the tests that need it already fail, naming `OCU_TEST_NODE` (`:683-686`, `:1077-1078`, `:1283`). Removing the fallback makes that true on every machine, including the one whose path was hard-coded. Those failure messages stay as they are.

**New workflow `.github/workflows/preview-harness.yml`.** This is a CI-file change, and the PR flags it.

- Trigger: `pull_request` to `main`, filtered to the paths the harness covers: `computer-use-server/static/**`, `computer-use-server/**/*.py`, `tests/orchestrator/preview_embedding_browser.cjs`, `tests/orchestrator/_preview_capture.py`, `computer-use-server/requirements.txt` and the workflow itself. Also `workflow_dispatch`.
- One job on `ubuntu-latest`, `permissions: contents: read`. Actions are pinned by SHA as in the other workflows:
  - `actions/checkout@3d3c42e…`;
  - `actions/setup-python@5fda3b9…`, Python 3.12;
  - `actions/setup-node@48b55a0…`, Node 22.
- Steps:
  1. A venv with `computer-use-server/requirements.txt` and pytest.
  2. Playwright installed at exactly 1.62.1 without the repository's full `package.json` dependency set (no lockfile exists, and the set pulls heavy unrelated packages). For example, `npm install --no-save --no-package-lock playwright@1.62.1` in a scratch prefix, with `NODE_PATH` pointing at it.
  3. `npx playwright install --with-deps chromium` from that install.
  4. `node tests/orchestrator/preview_embedding_browser.cjs` from the repository root, with `OCU_PREVIEW_PYTHON` set to the venv's python.
- No secrets, no image builds, no pushes.

**Docs.** `computer-use-server/README.md:507-509` adds that the `preview-harness` workflow runs the harness on pull requests.

Deviation from the issue: the harness runs in a new workflow, not in `build.yml`, because `build.yml` is disabled on the fork.

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
Selected risk packs: Config / project setup (new workflow, pinned toolchain); Release / packaging / dependency compatibility (Playwright pinned at 1.62.1); Documentation (README)
Not selected: Public API (none); Auth / secrets (workflow uses no secrets, read-only token); Error handling (test-only); Legacy compatibility (no runtime change); Concurrency, File IO, Schema, Resource limits (none)
Evidence floor: `git grep -n '/Users/' tests` empty; test_preview_prefix with node removed from PATH fails naming OCU_TEST_NODE; the new workflow runs on the OCU PR and passes on its head; the harness passes locally
design.md: omitted (compact)
```
