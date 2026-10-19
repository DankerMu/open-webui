## 1. Fixture

- [x] 1.1 Expanded fixture (raised from compact on fixture review), read-only fixture review and strict validation before implementation.

## 2. Implement

- [x] 2.1 Add failing harness-environment cases first per design.md Seams: copies of both scripts in an isolated `tmp_path` git checkout (toplevel asserted), allowlisted env, recording `uv` stand-in, parent flag unset and `false`; exactly 1 reset record and 3 verify records with argv, each with a truthy flag and `DATA_DIR`/`DATABASE_URL` under `<tmp>/.run/data`; pre-created `<tmp>/.run/data/webui.db` removed, outside sentinel survives.
- [x] 2.2 In the same cases the stand-in imports the real `open_webui.env` with `find_dotenv` and `DotEnv._get_stream` stubbed to a synthetic complete `DATABASE_*` stream; the resolved URL must equal `sqlite:///<tmp>/.run/data/webui.db`. Control (direct import probe, same stubs, no flag) resolves the dotenv-constructed URL.
- [x] 2.3 Export `PYTHON_DOTENV_DISABLED=1` in `scripts/db-reset.sh` and `scripts/db-verify.sh` before their Alembic calls, with a comment naming the failure mode and that discovery still runs.

## 3. Verify

- [x] 3.1 `make test-harness-env` (red before 2.3, green after), `make db-verify` exit 0, `make lint-scoped`, `make doc-gate`.

## Risk packs

Selected:

- Public API / CLI / script entry: 2.1 covers both entrypoints and every Alembic step, including the nested reset.
- Config / project setup: 2.2 proves dotenv-supplied `DATABASE_*` cannot redirect the target; control proves the oracle detects redirection.
- Auth / permissions / secrets: tests use synthetic in-memory values only; dotenv discovery and stream are stubbed so no real `.env` is created, read or printed (non-goal: inspecting a real `.env`).
- File IO / path safety / overwrite: 2.1 isolation (tmp git toplevel asserted, allowlisted env) keeps the real `.run/data` untouched; deletion stays inside `<tmp>/.run/data` with an outside sentinel surviving; the `.run/` refusal branch is preserved by an unchanged diff (it cannot fire at runtime).

Not selected:

- Concurrency, resource limits, schema, release/packaging, legacy compatibility, error handling: no such behavior changes.
- Documentation / migration notes: script comments only; no user-facing doc describes the scripts' dotenv behavior.
- Sibling launchers without the flag (e.g. `scripts/coverage-gate.sh`): non-goal, report only.
