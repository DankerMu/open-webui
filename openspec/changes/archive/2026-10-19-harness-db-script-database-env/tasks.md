## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review and strict validation before implementation.

## 2. Implement

- [x] 2.1 Write the failing harness-environment cases first, following the design.md Seams:
  - the stand-in accepts `run --quiet [--no-env-file] alembic <step>`, with the flag optional; the record assertion is what requires the flag;
  - the stand-in models `UV_ENV_FILE` loading when the flag is absent, without overriding existing keys, and records whether each of the six `DATABASE_*` names is present in the environment it actually passes to the probe;
  - parent-shell `DATABASE_*` and `UV_ENV_FILE` vectors for both scripts (1 reset record, 3 verify records), each asserting the resolved URL is `sqlite:///<tmp>/.run/data/webui.db` and that no `DATABASE_*` name is present.
- [x] 2.2 Real-uv contract case. Run uv with `--no-project --offline --no-config --python <sys.executable>` and `UV_CACHE_DIR` under `tmp_path`, with `UV_ENV_FILE` set to the fake file. Expected:
  - `--no-env-file` hides `DATABASE_HOST`;
  - the same command without the flag exposes it (control);
  - in both arms, a key set both in the parent and in the file keeps the parent's value.
- [x] 2.3 In `scripts/db-reset.sh` and `scripts/db-verify.sh`, unset the six `DATABASE_*` names before the Alembic calls (in `db-verify.sh`, before the child reset), and add `--no-env-file` to every Alembic `uv run`. One comment names the failure mode.

## 3. Verify

- [x] 3.1 Run `make test-harness-env` (red before 2.3, green after), `make db-verify` (exit 0), `make lint-scoped` and `make doc-gate`.

## Risk packs

Selected:

- Public API / CLI / script entry: 2.1 covers both entrypoints and all three Alembic invocations, including the nested reset.
- Config / project setup: 2.1 proves that shell- and env-file-supplied `DATABASE_*` cannot redirect the target; 2.2 anchors the uv flag semantics with a control.
- Auth / permissions / secrets: only fake hosts and credentials in `tmp_path`; no real `.env`, shell profile or uv user config is read or printed.
- File IO / path safety / overwrite: isolated tmp checkout; the deletion bound and outside sentinel are kept; the `.run/` refusal line is unchanged.

Not selected:

- Concurrency, resource limits, schema, release/packaging, legacy compatibility, error handling: no such behavior changes.
- Documentation / migration notes: script comments only.
- Backend pytest path: non-goal, report only.
