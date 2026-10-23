## 1. Fixture

- [x] 1.1 Compact fixture, read-only fixture review, `openspec validate ocu-recovery-canonical-workspace-keys --strict --no-interactive`.

## 2. Implement (in open-computer-use)

- [x] 2.1 Test first in `tests/deploy/test_recovery.py`, following `test_verify_applies_the_component_link_policy` (copy the backup, rewrite `recovery.json`). For each of key `CHAT_ID.upper()` and key `" " + CHAT_ID`, move the `components.workspaces[CHAT_ID]` record under that key, leaving the record (`chat_id`, `path`, `volume`, `sha256`) and the archive unchanged:
  - `verify --recovery-set <copy>` exits non-zero and stderr contains `is not a canonical chat id`;
  - `restore` of the same copy against a distinct target daemon (`_seed_restore_target`, `FAKE_DOCKER_STATE`) exits non-zero with the same message, and no `chat-*-workspace` volume exists in the target state afterwards.
  - "no workspace volume" is asserted the way existing tests do: `volumes.json` absent from the target state (`_seed_restore_target` seeds none).
  - Red on `4d59f38`: verify exits 0 for both keys.
- [x] 2.1b Issue criterion 2 (restore fills exactly the verified `record["volume"]`) maps to `test_restore_recreates_model_written_links_verbatim`; extend it to assert the target's `chat-*-workspace` volumes in `volumes.json` are exactly `{record["volume"]}` for the set's single workspace.
- [x] 2.2 `verify_recovery_set`: refuse a workspace key that differs from its canonical id, before the record checks.
- [x] 2.3 Green in `python:3.13` with the CI deps: `python -m unittest test_recovery` from `tests/deploy`, including the backup tests (backup self-verify) (as root, or as uid 1001 with the stdlib precompiled until #620 lands); `./tests/test-project-structure.sh`.

## Risk packs

Selected:

- **File IO / path safety:** names derived from recovery-set keys, 2.1.
- **Legacy compatibility:** sets written by backup (canonical keys) keep verifying and restoring, and backup's self-verify keeps passing, 2.1b, 2.3.

Not selected:

- **Public API / CLI:** `verify` and `restore` arguments and output unchanged; only tampered input gets a new refusal (exercised by 2.1).
- **Schema / file format:** `recovery.json` shape unchanged.
- **Error handling:** uses the existing `RecoveryError` path.
- **Documentation:** no operator-visible procedure change; a tampered set already fails verify for other reasons.
