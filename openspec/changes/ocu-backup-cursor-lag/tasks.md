## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec delta; fixture review; `openspec validate ocu-backup-cursor-lag --strict --no-interactive`.

## 2. Risk packs

- **Public API / CLI / script entry** — selected: backup refusal and restore messages. Evidence a, b, c, e.
- **Error handling / rollback / partial outputs** — selected: refuse before any stop or stage. Evidence a, b.
- **Legacy compatibility** — selected: healthy deployments and orphan rows unaffected; restore guard unchanged. Evidence d, e, f.
- **Documentation** — selected: BACKUP-RESTORE.md cursor paragraph and Failure recovery. Task 3.3.
- **Auth / secrets, Schema, Concurrency, File IO, Resource limits, Release packaging** — not selected; reasons are in the proposal Fixture block.

## 3. Implement OCU

- [ ] 3.1 Tests first for design evidence a–f in `tests/deploy/test_recovery.py` (and `tests/deploy/test_recovery_db.py` if f lands there); record which fail on `main`.
- [ ] 3.2 `recovery_db.py` shared read; `recovery_resources.py` pre-quiesce check, shared "leads" helper and messages.
- [ ] 3.3 `deploy/BACKUP-RESTORE.md`.
- [ ] 3.4 Green:
  - OCU unit command for `tests/deploy/test_recovery.py`, `tests/deploy/test_recovery_db.py` and the other `tests/deploy` modules importing `recovery`;
  - the scripts/docs-lint gates;
  - environment-only failures (port 8082) shown identical to `main`.
