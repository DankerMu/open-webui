## 1. Fixture

- [x] 1.1 Compact fixture, read-only fixture review, `openspec validate ocu-recovery-tests-non-root --strict --no-interactive`.

## 2. Implement (in open-computer-use)

- [x] 2.1 Reproduce first on `bff4f29`: in `python:3.13` with the CI deps (`computer-use-server/requirements.txt`, PyYAML 6.0.2), run `python -m unittest test_recovery` from `tests/deploy` as uid 1001 and as uid 0, no extra `-e`; record the full failure/error set by test name for both.
- [x] 2.2 `_cli_env`: default `OCU_ADMIN_CREDENTIALS_FILE` to a non-existent path under the test temp root (an `extra` value wins).
- [x] 2.3 Test first, unit call on `_require_cursor_lag` with `restored={"live_chats": ["../x"], "chat_state": [{"chat_id": "../x", "last_seen_revision": 0}]}` (the id in both lists) and `_index_snapshot` / `_broker_listing` patched to fail the test if called: expect `RecoveryError` matching `invalid chat id`, neither helper called. Red on `bff4f29` (today it reaches `continue`). Plus one case that a mixed-case live id is canonicalized and passed lowercased to `_index_snapshot`.
- [x] 2.4 `_require_cursor_lag`: canonicalize the chat id before use.
- [x] 2.5 Green: 2.1's command as uid 1001 gives the same result as uid 0, with zero errors; any failure left only as non-root is named in the PR, fixed here if it is the same class (an unset test env variable falling back to a root-only path), otherwise filed; the full `tests/deploy` unittest run in the same container; `./tests/test-project-structure.sh`.

## Risk packs

Selected:

- **File IO / path safety:** the canonical chat id check, 2.3.
- **Config:** the test env default, 2.1 and 2.5.

Not selected:

- **Public API / CLI:** no CLI change.
- **Error handling:** the new refusal uses the existing `RecoveryError` path.
- **Documentation:** no operator-visible change.
- **Auth / secrets:** the test default points at a non-existent temp path; the production fallback and `copy_private` are unchanged and no credential bytes are written.
