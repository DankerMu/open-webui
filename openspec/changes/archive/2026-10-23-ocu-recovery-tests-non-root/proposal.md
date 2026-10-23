## Why

#609. In the sibling `open-computer-use` checkout at `origin/main` `bff4f29`:

- `tests/deploy/test_recovery.py` `RecoveryCliTests._cli_env` (`:685-694`) does not set `OCU_ADMIN_CREDENTIALS_FILE`. `deploy/recovery_resources.py` `backup_deployment` (`:762-765`) then falls back to `/root/ocu-test-openwebui-admin-credentials.txt` and calls `exists()` on it. As a non-root user (uid 1001 in the CI-shaped `python:3.13` container, or a hosted runner) that raises `PermissionError`, and every backup, verify and restore test errors (29 on `8df244d`, 33 with OCU PR #163). `tests/deploy/test_offline_release.py:3188` already points the variable at a file under the test's temporary root.
- Related note in the issue: `_require_cursor_lag` (`:1501-1507`) passes `row["chat_id"]` from the restored database to `_index_snapshot` without `recovery.canonical_chat_id`, while `_broker_listing` (`:1455`) canonicalizes it. A tampered dump with chat id `../x` would be joined under `chat_dir` unnormalised. It needs a tampered recovery set (root already), so it is low risk; it is fixed here because it is one call in the same module and the issue names it.

## What Changes

In `open-computer-use` only:

- `_cli_env` sets `OCU_ADMIN_CREDENTIALS_FILE` to a path under the test's temporary root, unless the caller's `extra` sets it. No test at `bff4f29` needs the file to exist (`:745` only checks that the `admin-config` key is present, which holds with `path: None`). Production code does not change for this part.
- `_require_cursor_lag` canonicalizes each live `chat_id` once with `recovery.canonical_chat_id` (`deploy/recovery.py:527-531`), after the `in live` check (calling it before would quietly skip a mixed-case id, since `canonical_chat_id` also strips and lowercases), and passes the canonical id to both `_index_snapshot` and `_broker_listing`. For an empty id or one containing `..`, `/`, `\` or NUL it raises `RecoveryError("invalid chat id '<value>'")`, so restore fails before any host path derived from that id is opened. Both input lists are raw database values (`recovery_db._live_chat_ids`, `_chat_state_rows`).
- Must preserve: for any id that is already canonical (`canonical_chat_id(id) == id`), the cursor decision is unchanged; a mixed-case id is now read under its lowercased directory by both helpers, deliberately; `test_cursor_lead_rejects_and_activation_keeps_workspaces_stopped` (`tests/deploy/test_recovery.py:1911`) and `test_preferences_only_chat_without_index_restores` (`:1738`) stay green.

## Capabilities

### Modified Capabilities

- `ocu-backup-rollback`: new requirement "Restore canonicalizes restored chat ids before reading host state".

## Impact

- The recovery CLI tests run as non-root without extra `-e` flags, so hosted CI and the CI-shaped container can run them.
- A tampered restored database with a path-like chat id is refused at the cursor check.

## Triage

```text
Issue type: test (plus one hardening line)
Fixture level: compact
Upstream suggested level: absent; compact: test-environment fix plus one validation call on an existing restore path, no format or entrypoint change
Blast radius: test environment only, and a refusal on tampered restore input
Selected risk packs: File IO / path safety (canonical chat id); Config (test env variable)
Evidence floor: python -m unittest test_recovery in python:3.13 with the CI deps, as uid 1001 and as uid 0, no extra -e: the uid-1001 result equals the uid-0 result with zero errors; a new unit test that a non-canonical live chat id is refused, red before the fix
design.md: omitted at compact level
```
