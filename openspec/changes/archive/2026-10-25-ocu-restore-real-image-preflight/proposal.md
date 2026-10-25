## Why

#637. The B-T14 cross-daemon restore drill (2026-10-25) was the first run of `deploy/recovery.py restore` and `activate` against the shipped release images. The setup was a complete `1dba74e` backup that `verify` accepts, a separate `docker:29.1.3-dind` daemon, and the retained `1dba74e` delivery. Two preflight checks refuse every restore:

- **Migration-graph probe.** `inspect_migration_graph` (`deploy/recovery_db.py:319-352`) runs the WebUI image with no environment. Walking the Alembic revisions imports `open_webui.internal.db` from nine revision files, hence `open_webui.env`, and WebUI 0.11.3 `env.py:765-773` exits when `WEBUI_AUTH` is on (the default) and `WEBUI_SECRET_KEY` is empty. The container exits non-zero, so restore stops at `recovery_db.py:338` with "selected WebUI image did not report a migration graph". The probe is reached through `require_compatible_revision` (`recovery_db.py:398`) from restore (`deploy/recovery_resources.py:1342`) and activation (`:1573`, `:1591`). With a non-empty placeholder the probe prints `HEADS=e6f7a8b9c0d1` and 59 `REV=` lines.
- **Empty-database check.** `EMPTY_DB_QUERY` (`deploy/recovery_db.py:48-52`) counts every `pg_class` row outside `pg_catalog` and `information_schema`. A fresh PostgreSQL 17.11 database (the delivered `ocu-postgres` image) has 80 relations in `pg_toast`. So `restore_database` (`:168-172`) always refuses with "target database is not empty".

The deploy tests fake the engine, so neither the probe environment nor the SQL ever met a real image. With both fixed locally in the drill daemon, `restore` and `activate` succeeded and the restored deployment passed the functional checks (#637).

## What Changes

In `open-computer-use`:

- `inspect_migration_graph` passes `-e WEBUI_SECRET_KEY=recovery-migration-probe-placeholder` to its `docker run` (the `-e KEY=VALUE` form, which the fake engine already parses, `tests/deploy/fakebin/docker:1592-1595`).
  - The probe runs with `--network none`, reads only the image's migration files, and never sees runtime values.
  - No value from `runtime.env` or the recovery set is passed.
- `EMPTY_DB_QUERY` counts only user relations: its predicate becomes `left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema'`. PostgreSQL reserves the `pg_` prefix (a user `CREATE SCHEMA pg_x` is refused), so this covers `pg_catalog`, `pg_toast`, `pg_temp_N`, `pg_toast_temp_N` and future system schemas without `LIKE` escaping, whose meaning would depend on `standard_conforming_strings`.
  - The query still counts any table, sequence, view or index in `public` or another user schema.
- The fake engine (`tests/deploy/fakebin/docker`) models both behaviours, so the existing end-to-end restore/activate tests guard the regression:
  - the migration-graph script (`:1674`) exits non-zero when `WEBUI_SECRET_KEY` is missing or empty, like WebUI `env.py:765`;
  - the `pg_class` count (`:1949-1950`, today a constant `0`) is driven by fake PostgreSQL state listing relations with their schema, so a state with only `pg_toast` relations restores and one with a `public` table refuses.
- Tests read the recorded probe run (`runs.json`, `fakebin/docker:1617-1631`) and assert `env == {"WEBUI_SECRET_KEY": "recovery-migration-probe-placeholder"}` and `network == "none"`.
- The PR also carries one real-image check of each against the delivered images.

Must preserve:

- a probe that exits non-zero (`recovery_db.py:338`) or prints no revisions (`:350`) still refuses;
- a target database holding any user relation still refuses;
- restore and activation order, refusals and messages are otherwise unchanged.

Out of scope: other recovery steps (none failed in the patched drill); a dind drill harness in the repo.

## Capabilities

### Modified Capabilities

- `ocu-backup-rollback`: new requirement "Restore preflight works against the shipped images".

## Impact

A complete backup set can actually be restored and activated, which the cold-backup procedure promises.

## Triage

```text
Issue type: bug (restore/activate unusable)
Fixture level: compact
Upstream suggested level: issue says S; compact: two literal changes (one argv element pair, one SQL predicate), no state or flow change
Blast radius: every restore and activation; a wrong predicate could accept a non-empty target
Selected risk packs: Integration (behaviour against real images); Security (no runtime secret enters the probe)
Evidence floor: fake engine models the WebUI env.py exit and state-driven pg_class counts; tests for the probe env/network (placeholder only, no runtime value), restore accepting a pg_toast-only target and refusing a target with a public table, probe non-zero exit and empty graph still refusing; red on 1dba74e; tests/deploy in the CI-shaped container (non-root) and root-only cases; ./tests/test-project-structure.sh; real-image check of the probe and the query against the delivered images; an unpatched cross-daemon restore + activate from the fixed checkout
design.md: not required (compact)
```
