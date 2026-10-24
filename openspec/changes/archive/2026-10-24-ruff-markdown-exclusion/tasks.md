## 1. Fixture

- [x] 1.1 Compact fixture, read-only fixture review, `openspec validate ruff-markdown-exclusion --strict --no-interactive`.

## 2. Implement (fork, from `main` `72121901d`)

- [x] 2.1 Red: `uvx ruff@0.17.2 format --check . --exclude .venv --exclude venv` on `72121901d` → the seven archived design docs.
- [x] 2.2 `pyproject.toml` `[tool.ruff]`: `extend-exclude = ["*.md"]` with the inline failure-mode comment.
- [x] 2.3 Green: 2.1's command exit 0; the F-rule command from `backend.yaml:42-43` exit 0; `make fmt-check`, `make lint`; the "N files already formatted" count from ruff 0.17.2 equals the count from the locked `uv run ruff format --check . --exclude .venv --exclude venv` on the same tree (only Markdown is excluded); `git diff --quiet 72121901d -- <the seven archived design docs listed in #632>` exits 0. The PR names its effect on "Python CI"; its run passes "Verify formatting" and "Detect logic errors" in both matrix jobs.

## Risk packs

Selected:

- **Config / project setup:** formatter scope and its comment, 2.2, 2.3.

Not selected:

- **Release / dependency compatibility:** no dependency or lockfile change.
- **Documentation:** no operator-facing doc; the comment records the version gap.
