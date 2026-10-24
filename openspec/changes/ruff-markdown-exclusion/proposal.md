## Why

#632. The upstream "Python CI" workflow (`.github/workflows/backend.yaml:36-40`) installs an unpinned `ruff>=0.15.5` and runs `ruff format --check .` over the repository. Ruff 0.16 and later format Python fences inside Markdown by default (the locked 0.15.18 does so only with `--preview`), and seven archived OpenSpec design docs contain double-quoted Python fences, so the workflow has failed on `main` since 2026-10-22 and its next step, `ruff check --select=F`, is skipped. Nothing local reproduces it: `make fmt-check` uses the locked ruff on `backend/` only.

## What Changes

- `pyproject.toml` `[tool.ruff]` gains `extend-exclude = ["*.md"]` with an inline comment naming the failure mode (CI's unpinned ruff ≥ 0.16 formats Markdown fences by default; the locked 0.15.18 only with `--preview`).

Must preserve: `make fmt-check` and `make lint` unchanged and green (they pass `backend` explicitly, `Makefile:64/68/75`; the pre-commit ruff hooks are limited to `files: ^backend/`, `.pre-commit-config.yaml:32-36`; `scripts/check-fast.sh:12` and `scripts/lint-scoped.sh:83` pass `.py` files only, so no local gate reads Markdown); the seven archived docs byte-identical (frozen history, `constraints.yaml:251-253`); `backend.yaml` and `uv.lock` untouched; Python source still formatter-checked: the CI-resolved ruff checks exactly the files the locked ruff checks.

Scope note: the existing `source-format-boundary` requirement "Generated review state is outside the formatting boundary" ("Formatter options, versions and the repository-wide source glob SHALL remain unchanged") is about Prettier (#221); this change adds a ruff requirement and does not alter it.

Non-goals: upgrading the locked ruff; changing `ci.yml` or `make fmt-check` scope; making "Python CI" required.

## Capabilities

### Modified Capabilities

- `source-format-boundary`: ADDED requirement "Markdown is outside the Python formatter boundary".

## Impact

"Python CI" passes again on `main` and on PRs, and its F-rule step runs on Python outside `backend/` again.

## Triage

```text
Issue type: bugfix
Fixture level: compact
Upstream suggested level: absent (issue says S); compact: one formatter config value, no runtime behaviour
Blast radius: formatter scope in CI and locally
Selected risk packs: Config (formatter scope, inline failure-mode comment)
Evidence floor: `uvx ruff@0.17.2 format --check . --exclude .venv --exclude venv` exit 1 on 72121901d (7 files), exit 0 after; `uvx ruff@0.17.2 check --select=F --ignore=F401,F403,F405,F541,F811,F841 .` exit 0; the formatted-file count from ruff 0.17.2 equals the locked `uv run ruff format --check . --exclude .venv --exclude venv` count on the same tree; the seven archived docs unchanged (`git diff --quiet 72121901d -- <paths>`); `make fmt-check`, `make lint`; the PR's "Python CI" run green on both matrix jobs with both steps run
design.md: omitted at compact level
```
