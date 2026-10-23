## Why

#619. In the sibling `open-computer-use` checkout at `main` `4d59f38`:

- `verify_recovery_set` (`deploy/recovery_resources.py:891-901`) canonicalizes each `components.workspaces` key with `recovery.canonical_chat_id`, then checks the record's `chat_id`, `path` and `volume` against the canonical id. It never requires the key to _be_ canonical.
- `restore_deployment` (`:1396-1397`) builds the volume name from the raw key: `recovery.workspace_volume_name(chat_id)`.
- So a recovery set with key `Chat-X` and a record for `chat-x` passes verify, and restore then creates and fills `chat-Chat-X-workspace`, not the verified `chat-chat-x-workspace`. A padded key (`" chat-x"`) gives a volume name Docker refuses. Backup always writes canonical keys (`:750-756`), so only a tampered set reaches this (operator root, low severity). Same class as the #609 hardening.

## What Changes

In `open-computer-use` only:

- `verify_recovery_set`: for each workspace key, if `chat_id != recovery.canonical_chat_id(chat_id)` raise `RecoveryError(f"workspace {chat_id!r} is not a canonical chat id")`, before the existing record checks. Invalid ids (`..`, `/`, empty) keep the existing `canonical_chat_id` refusal.
- `restore_deployment` is not changed; the issue's suggestion to have restore use `record["volume"]` is declined because verify is the single gate. `restore` calls `verify_recovery_set` first (`:1277`) and iterates that same payload (`:1396`), so after this change every key restore sees equals its canonical id, and `workspace_volume_name(chat_id)` equals the verified `record["volume"]`. One gate, no second copy of the rule. `release.load_json_object` already refuses duplicate keys (`deploy/release.py:1250-1256`), so two keys that canonicalize to the same id can no longer both pass.

Must preserve:

- every backup this code writes still verifies and restores (keys are already canonical, `:387`);
- backup's own self-verify (`backup_deployment` calls `verify_recovery_set(stage, require_published=False)`, `:811`) keeps passing;
- the existing verify refusals and their messages (`not bound to its declared chat`, `... path ...`, `... volume`);
- `test_verify_applies_the_component_link_policy` and `test_restore_recreates_model_written_links_verbatim` stay green.

## Capabilities

### Modified Capabilities

- `ocu-backup-rollback`: new requirement "Verify refuses non-canonical workspace keys".

## Impact

A tampered recovery set whose workspace key is not canonical fails `verify` (and therefore `restore`) before any volume is created.

## Triage

```text
Issue type: bugfix (hardening)
Fixture level: compact
Upstream suggested level: absent (issue says S); compact: one validation line in an existing verifier, no format or entrypoint change
Blast radius: verify/restore of tampered sets only; a wrong fix could refuse valid sets, including backup's self-verify
Selected risk packs: File IO / path safety (names derived from recovery-set ids); Legacy compatibility (sets written by current and earlier backups)
Evidence floor: CLI tests in tests/deploy/test_recovery.py — uppercase key and padded key each refused by verify and by restore with no volume created, red on 4d59f38; existing recovery tests green; python:3.13 container run of test_recovery
design.md: omitted at compact level
```
