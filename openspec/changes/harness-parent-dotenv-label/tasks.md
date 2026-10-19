## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review and strict validation before implementation.

## 2. Implement

- [x] 2.1 Extend `test_harness_environment.py` first (red): harness import (single sourcing) with parent unset, `false`, `1` and a non-allowlisted value asserts exactly one stderr label line (`unset`/`false`/`1`/`other`), no raw-value leak, and the existing no-dotenv-load observation.
- [x] 2.2 Audit consumers listed in design.md for stderr parsing or zero-stderr assertions; report findings. Adjust only if a consumer would break (none expected).
- [x] 2.3 Relay test first (red) in `backend/open_webui/test/test_harness_environment.py` (stubbed stage stderr holding a `harness-env:` line plus other text; only the label line reaches stderr), then make `scripts/verify-ui-ocu.py` forward `harness-env:` lines from its captured `dev-bg.sh stage` stderr to its own stderr (forwarding only).
- [x] 2.4 Add the classification and stderr line to `scripts/dev-env.sh` immediately before the export, with a comment naming the provenance purpose.

## 3. Verify

- [x] 3.1 `make test-harness-env`, which includes the relay test (red before, green after); `make dev-bg` (parent unset) → stderr `unset`, `make dev-stop`, `PYTHON_DOTENV_DISABLED=false make dev-bg` → stderr `false`, `make dev-status`, `make smoke`, `make dev-stop`; `make lint-scoped`; `make doc-gate`.

## Risk packs

Selected:

- Public API / CLI / script entry: 2.2 consumer audit, 2.3 verify-ui-ocu relay, 3.1 real dev-bg/status/smoke runs with both parent states.
- Auth / permissions / secrets: 2.1 `other` case proves a non-allowlisted value is not echoed; only one non-secret variable's label is recorded, no environment dump.
- Legacy compatibility / examples: policy export and other exports unchanged; historical #419 evidence untouched (non-goal: backfill/rerun).
- Documentation / migration notes: comment in `dev-env.sh`; the spec delta defines label format and per-sourcing semantics; design.md names consumer-fixed labels and the receipt-assembler residual risk.

Not selected:

- File IO / path safety, concurrency, resource limits, schema (no receipt file/schema added), release/packaging, error handling: no such behavior changes.
