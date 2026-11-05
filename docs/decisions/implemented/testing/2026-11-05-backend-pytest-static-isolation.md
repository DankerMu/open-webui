---
id: 2026-11-05-backend-pytest-static-isolation
title: Backend pytest and dev-env own their STATIC_DIR
kind: testing
status: implemented
date: 2026-11-05
supersedes: none
references: issue-695
---

# Backend pytest and dev-env own their STATIC_DIR

## Problem

When `open_webui.config` is imported, it deletes the top-level files of `STATIC_DIR` and refills them from `FRONTEND_BUILD_DIR/static`. By default `STATIC_DIR` is the tracked `backend/open_webui/static/`, `FRONTEND_BUILD_DIR` is `build/` and `DATA_DIR` is `backend/data`. Each backend pytest session therefore deleted tracked files, including uncommitted branding edits, and created `backend/data/webui.db`. CI has no `build/`, so nothing refilled the deleted files. Setting `FRONTEND_BUILD_DIR` alone left the tracked tree as the target of the wipe.

## Decision

`scripts/dev-env.sh` holds the only copy of the path rules. `backend/conftest.py` runs before any `open_webui` import, passes the work to dev-env.sh and adopts the values dev-env.sh returns. It writes them to `os.environ` because child processes copy that environment.

- **Derived STATIC_DIR.** dev-env.sh derives `STATIC_DIR` from `FRONTEND_BUILD_DIR`: `.run/frontend-build` gives `.run/backend-static`, and `.run/pytest/frontend-build` gives `.run/pytest/backend-static`. dev-env.sh accepts a caller-set `STATIC_DIR` only if it is a path under `.run/` that does not pass through a symlink and has no empty, `.` or `..` components. dev-env.sh refuses `.run/data`, `DATA_DIR` and `FRONTEND_BUILD_DIR/static` as `STATIC_DIR`, because the wipe would delete `webui.db` or the files it refills from. Every refusal message names `STATIC_DIR`.
- **Staging copies, never deletes.** `stage_frontend_assets` copies the tracked `backend/open_webui/static/` tree into `STATIC_DIR` and reads the tracked tree only. The tree includes the `assets/`, `fonts/` and `swagger-ui/` directories, which the backend reads at runtime.
- **Inherited pairs are both or neither.** If `FRONTEND_BUILD_DIR` and `STATIC_DIR` are both inherited, dev-env.sh validates them and nothing is restaged, because staging deletes `FRONTEND_BUILD_DIR/static`. If neither is inherited, the conftest stages its own `.run/pytest/` pair. If only one is inherited, the session fails before collection with an error that names both variables, because the inherited `STATIC_DIR` would be wiped with nothing staged to refill it. After validation the conftest creates `DATA_DIR` and `STATIC_DIR` if they are missing. It never deletes either.
- **CI.** The `guardrail-self-test` job in `.github/workflows/agents-md-liveness.yml` installs the backend virtual environment the same way as `ci.yml` layer1. The job runs `uv sync --frozen --group dev --no-install-project` so that `open_webui` resolves to the temporary worktree. The job timeout is now 10 minutes. Guardrail case 11 runs real backend imports in that worktree and checks that the tracked tree stays byte-identical.

## Alternatives considered

- **Reimplement the path rules in Python in the conftest** — this would create a second copy of rules that dev-bg, verify-ui-ocu and smoke-proxy already apply through dev-env.sh. The two copies would drift apart.
- **`monkeypatch` the environment per test** — this runs after collection has imported `open_webui`, and it does not reach the child processes that copy `os.environ`.
- **Patch `config.py` to skip or guard the wipe** — this changes the upstream code path for a harness-only problem and makes rebasing onto upstream harder.

## Consequences

Each pytest session copies the tracked static tree (about 69 MB) into `.run/pytest/backend-static`. Concurrent backend pytest sessions in one checkout share `.run/pytest/` and `.run/data`. Sharing `.run/data` was already the case before this change. A bare `python -c 'import open_webui.config'` that bypasses both pytest and dev-env.sh still wipes the tracked tree. AGENTS.md note 6 documents this risk; nothing prevents it. Changes to the path rules belong in dev-env.sh and in guardrail case 11, not in the conftest.
