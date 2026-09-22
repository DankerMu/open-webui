# Tasks

## 1. Response mirror

- [x] 1.1 Add tests/test_files_headers.py using the real app, configured guard and isolated files. Capture semantic red for all five target MIME types and non-download/download matrix; verify both XML MIME variants and non-target/error cases.
- [x] 1.2 Set the fixed CSP and nosniff only in the existing qualifying non-download file response branch; prove the matrix green and preserve bytes, disposition and existing auth/path semantics.
- [x] 1.3 Update only directly relevant docs/changelog; keep default disposition follow-up #62 and proxy #22 separate.

## 2. Verification and review

- [x] 2.1 Pinned-runtime acceptance via direct subprocess: `uv run --no-project --python 3.12 --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/ -q --import-mode=importlib --ignore=tests/integration`: 499 passed, 5 skipped. Observed FastAPI 0.115.0 / Starlette 0.38.6; structure 24 passed. This supersedes shell-tool runs that resolved a different interpreter. No Docker; epic task 19.0 owns final runtime acceptance.
- [x] 2.2 Fixture approval and strict validation passed; three-seat review clean without fixes at `2bebfcb5a3c3c85c566b6fa22c6ecc243b63f873`. Durable evidence: https://github.com/DankerMu/open-computer-use/pull/6#issuecomment-5774655949.

## Risk packs

- Public API / CLI / script entry — selected: 1.1–1.2 actual file response/header matrix.
- Auth / permissions / secrets — selected: 1.1–1.2 browser sandbox policy, unchanged token denial, no allow-same-origin.
- Legacy compatibility / examples — selected: 1.1–1.3 download and unrelated MIME behavior unchanged.
- Error handling / rollback / partial outputs — selected: 1.1 error status/header behavior and no partial file changes.
- File IO / path safety / overwrite — not selected for change: file read/path logic untouched; existing traversal suite remains regression coverage under 2.1.
- Config / project setup; Schema / columns / units / field names; Concurrency / shared state / ordering; Resource limits / large input / discovery; Release / packaging / dependency compatibility — not selected: fixed per-response headers, no state/config/dependency changes.
- Documentation / migration notes — not selected as a substantive pack: short current-contract note only; no configuration migration.
