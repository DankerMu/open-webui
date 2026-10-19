## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement

- [x] 2.1 Add harness=True regression cases (a) an inherited `DATABASE_URL`, (b) the complete fake set, and (c) a real-uv `UV_ENV_FILE`, using the existing `source scripts/dev-env.sh` probe seam. Each case asserts the `workspace-ui-*` SQLite URL and that no fake credential leaks. Add control (d): harness=False with the same inherited URL resolves to it. Capture red.
- [x] 2.2 In `scripts/dev-env.sh`, after the `DATA_DIR` validation and export, unset the six `DATABASE_*` names and `UV_ENV_FILE`, then export `DATABASE_URL="sqlite:///$DATA_DIR/webui.db"`, with one failure-mode comment.

## 3. Verify

- [x] 3.1 `make test-harness-env` (red then green), `make smoke`, `make verify-ui`, `make lint-scoped`.

## Risk packs

Selected:

- Config / project setup: 2.1 covers the three inheritance vectors and workspace isolation.
- Auth / permissions / secrets: fake hosts and credentials only; the no-leak assertion; no real `.env` is read.

Not selected:

- Concurrency, schema, release/packaging, file IO, legacy compatibility, documentation: no such behavior changes. The existing label contract is preserved.
