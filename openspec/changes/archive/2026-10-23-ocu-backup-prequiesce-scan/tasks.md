## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-backup-prequiesce-scan --strict --no-interactive`.

## 2. Implement (in open-computer-use)

- [x] 2.1 Tests first: design evidence (d) in `tests/deploy/test_recovery_fs.py`; (a), (b), (c), (e) in `tests/deploy/test_recovery.py` with the fake docker harness, including the `runs.json` read-only mount assertions. Record (a)–(c) red on `bff4f29`.
- [x] 2.2 `recovery_fs.scan_tree`; `capture_tree` uses it.
- [x] 2.3 Helper `scan` subcommand and `recovery_resources.scan_volume`.
- [x] 2.4 Pre-quiesce scan step in `establish_quiescence`, after the identity and attribution checks and before the `try:` that wraps `_quiesce_and_discover`; helper image resolved there; WebUI marker probe.
- [x] 2.5 `BACKUP-RESTORE.md`: the scan, what it covers, and that the race and unpredictable failures still leave the stack stopped.
- [x] 2.6 Orchestrator: capture's strict-UTF-8 file list filed as #616 and fixed before this change, so the scan has no UTF-8 rule.
- [x] 2.7 Green: the touched test modules, then `tests/deploy` in the CI-shaped container (`python:3.13`, non-root, with `OCU_ADMIN_CREDENTIALS_FILE` handled per #609 if it is not merged yet), then `./tests/test-project-structure.sh`.

## 3. Verify

- [x] 3.1 Acceptance host (optional, after merge): not required; the triggers need planted files in live volumes. Recorded as not run: no host run was made for this change.

## Risk packs

Selected:

- **Public API / CLI / script entry:** helper `scan` subcommand, backup CLI behaviour, (a)–(c), (e).
- **File IO / path safety:** read-only scan, `ro` mounts, live-tree tolerance, (a)–(d).
- **Error handling / rollback / partial outputs:** refusal leaves no stopped container and no stage, (a)–(c).
- **Concurrency / ordering:** scan after attribution and before the first stop; race documented, 2.4, 2.5.
- **Resource limits / large input:** member and byte limits enforced in the scan, (d).
- **Documentation:** 2.5.

Not selected:

- **Schema / file format:** archive format unchanged.
- **Auth / secrets:** no credential handling changes.
- **Legacy compatibility:** existing recovery sets verify and restore unchanged; the one stricter rule on the Python fallback (in-tree hardlinked symlink) is stated in design.md.
- **Release / packaging:** the helper ships in the existing image build; no inventory change.
