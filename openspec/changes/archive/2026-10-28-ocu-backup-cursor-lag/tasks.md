## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec delta; fixture review; `openspec validate ocu-backup-cursor-lag --strict --no-interactive`.

## 2. Risk packs

- **Public API / CLI / script entry** — selected: backup refusal and restore messages. Evidence a, b, c, h.
- **Error handling / rollback / partial outputs** — selected: refuse before any stop or stage; postgres-down refusal moves earlier. Evidence a, b, e, f.
- **Legacy compatibility** — selected: healthy deployments and orphan rows unaffected; restore guard unchanged; three existing tests rebuilt on captured-set edits. Evidence d, h, i.
- **Concurrency / shared state / ordering** — selected: rows read before indexes while writers run. Review-only: the fixture has no concurrent writer.
- **File IO / path safety** — selected: unreadable, non-regular or symlinked source index. Evidence e.
- **Documentation** — selected: BACKUP-RESTORE.md cursor paragraph and Failure recovery. Task 3.3.
- **Auth / secrets, Schema, Resource limits, Release packaging** — not selected; reasons are in the proposal Fixture block.

## 3. Implement OCU

- [x] 3.1 Work from OCU `origin/main` (`3fe7730` or later; the local `main` ref is stale). Tests first for design evidence a–i in `tests/deploy/test_recovery.py` (and `tests/deploy/test_recovery_db.py` if f lands there); rebuild the three affected existing tests as design.md says; record which fail on `main`. Evidence: new tests on an `origin/main` copy 13 failed / 5 passed (d and i are preservation); the three rebuilt tests keep their restore assertions (DankerMu/open-computer-use#191).
- [x] 3.2 `recovery_db.py` shared read; `recovery_resources.py` pre-quiesce check (postgres running, rows, then indexes), one per-row helper shared with restore, unreadable-index wrapping, messages with remedies. Also the broker's non-negative integer counter rule, every non-ELOOP OSError named per chat, and the `recovery.py` entry fix (review round 1). Evidence: merged as `78a1a0d`.
- [x] 3.3 `deploy/BACKUP-RESTORE.md`.
- [x] 3.4 Green:
  - OCU unit command for `tests/deploy/test_recovery.py`, `tests/deploy/test_recovery_db.py` and the other `tests/deploy` modules importing `recovery`;
  - the scripts/docs-lint gates;
  - environment-only failures (port 8082) shown identical to `main`.

  Evidence: recovery, recovery_db, recovery_fs and recovery_retarget 158 passed / 13 skipped; the 8082-bound modules fail identically on the branch and on `origin/main` (46/17, `Address already in use`); docs-lint six gates and the structure test pass; review round 2 clean.
