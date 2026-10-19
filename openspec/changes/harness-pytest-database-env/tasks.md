## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review and strict validation before implementation.

## 2. Implement

- [x] 2.1 Write the failing harness-environment cases first, per design.md Seams vectors 1–7 (plus the 6a control). Probes 1–6 install the dotenv stubs before any import, import the harness and then only `open_webui.env`, and run with `ENABLE_DB_MIGRATIONS=false`, fake hosts and the allowlisted env. Vector 7 uses `run_office_flag_process` with `monkeypatch.setenv`.
- [x] 2.2 Add the regression agreement assertion (not red-first) to `test_ocu_chat_state.py`: its direct engine URL equals `open_webui.env.DATABASE_URL`.
- [x] 2.3 In `configure_ocu_test_env()`:
  - pop the six `DATABASE_*` names and set `PYTHON_DOTENV_DISABLED='1'` before the existing assignments, with one comment naming the failure mode;
  - add the strict guard: if `open_webui.env` is already in `sys.modules`, raise `RuntimeError` naming the ordering requirement, without any URL or credentials.

## 3. Verify

- [x] 3.1 Run:
  - `make test-harness-env` (red before 2.3, green after);
  - `make test-backend` (full suite green);
  - `make coverage-gate`, `make lint-scoped`.

## Risk packs

Selected:

- Config / project setup: vectors 1–4 prove that shell, uv env-file and dotenv sources cannot redirect the session target.
- Auth / permissions / secrets: fake hosts and credentials only; the guard message carries no URL, host or credentials (vector 5 asserts no host or password leak); no real `.env` or operator config is read.
- Error handling: vectors 5 and 6 cover the strict fail-loud guard.
- Legacy compatibility: the full `make test-backend` run proves that existing suites, the collection order and the office-flag subprocess (vector 7) still work.

Not selected:

- Concurrency, resource limits, schema, release/packaging, File IO: no such behavior changes. The office-flag case uses its existing owned `.run/data/office-flag-*` directory.
- Documentation: test-harness comment only.
- `dev-env.sh` / `dev-bg.sh` sibling: non-goal, report only.
