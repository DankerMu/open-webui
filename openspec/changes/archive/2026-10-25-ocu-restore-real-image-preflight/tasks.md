## 1. Fixture

- [x] 1.1 Compact fixture, read-only fixture review, `openspec validate ocu-restore-real-image-preflight --strict --no-interactive`.

## 2. Implement (in open-computer-use, from `main` `1dba74e` or later)

- [x] 2.1 Tests first, with the fake engine extended (the fake must tell the old and new predicates apart, so the pg_toast-only case is red on `1dba74e`): the migration-graph script fails without a non-empty `WEBUI_SECRET_KEY`; the `pg_class` count follows fake PostgreSQL relations with schema names. In `tests/deploy/test_recovery_db.py` (and `test_recovery.py` for the CLI path): the probe run records `env == {"WEBUI_SECRET_KEY": "recovery-migration-probe-placeholder"}` and `network == "none"`; restore accepts a target holding only `pg_toast` relations and refuses one holding a `public` table with "target database is not empty"; a probe that exits non-zero or reports no revisions still refuses. Record red on `1dba74e`.
- [x] 2.2 `deploy/recovery_db.py`: `-e WEBUI_SECRET_KEY=recovery-migration-probe-placeholder` in the probe run; `EMPTY_DB_QUERY` predicate `left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema'`.
- [x] 2.3 Green: touched test modules on macOS, then `tests/deploy` in the CI-shaped container as uid 1001 and the root-only cases as uid 0; `./tests/test-project-structure.sh`.
- [x] 2.4 Real-image check against the delivered `1dba74e` images: the probe with the placeholder reports the graph; on the delivered `ocu-postgres` image the query returns `0` on a fresh database; non-zero after `CREATE TABLE public.t(id int)`; non-zero on separate fresh databases holding only `CREATE SEQUENCE public.s` and only `CREATE VIEW public.v AS SELECT 1`; and one higher than the table-only count after `CREATE INDEX` on that table. Evidence goes into the PR.

## 3. Acceptance

- [x] 3.1 An unpatched cross-daemon `restore` + `activate` from a checkout containing the fix, on a fresh drill daemon; evidence on #637.

## Risk packs

Selected:

- **Integration:** both checks behave correctly against the delivered WebUI and PostgreSQL images, 2.4, 3.1.
- **Security:** the probe gets a fixed placeholder, never a runtime secret, 2.1.

Not selected:

- **State / invariants:** no restored data is read or written differently.
- **Error handling:** existing refusals and messages are unchanged.
- **Documentation:** no operator-visible behaviour change.
