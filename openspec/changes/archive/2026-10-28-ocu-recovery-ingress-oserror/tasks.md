## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec deltas; fixture review; `openspec validate ocu-recovery-ingress-oserror --strict --no-interactive`.

## 2. Risk packs

- **Public API / CLI / script entry** — selected: four recovery commands and `check-ports.sh`. Evidence e, f.
- **Error handling / rollback / partial outputs** — selected: quiescence order, failure-path stop, restore occupancy, one-line refusals. Evidence a, b, d, f, g.
- **Config / project setup** — selected: deployment preflight. Evidence e.
- **Legacy compatibility** — selected: a stack without an ingress container still backs up; success outputs unchanged. Evidence c, f.
- **Documentation** — selected: `BACKUP-RESTORE.md` stop list and restart note. Task 3.3.
- **Auth / secrets, Schema, Concurrency, File IO, Resource limits, Release packaging** — not selected: none touched.

## 3. Implement OCU

- [x] 3.1 Tests first for design evidence a–d, f and g in `tests/deploy/test_recovery.py`, e in `tests/deploy/test_check_ports.py`; record which fail on `main`.
- [x] 3.2 `recovery_resources.py` (identity, stack check, stop, stopped-check, failure-path stop), `recovery.py` (`FIXED_CONTAINER_NAMES`, `OSError` in four handlers), `check-ports.sh` (critical list, sandbox branch).
- [x] 3.3 `deploy/BACKUP-RESTORE.md`: step 1 names the ingress; the restart note names both proxy and ingress.
- [x] 3.4 Green: OCU unit command for `tests/deploy/test_recovery.py`, `tests/deploy/test_check_ports.py` and the other `tests/deploy` modules importing `recovery`; scripts/docs-lint gates; full unit command where the environment allows, with environment-only failures shown identical to `main`.
  - Merged as OCU #188 (`3fe7730`, head `215319e`).
  - `test_recovery.py` + `test_check_ports.py`: 115 passed, 2 skipped, 108 subtests passed. The implementer ran it and the orchestrator re-ran it.
  - On `102dbdd`, 32 failed. These were the new tests a, b, d, e, f, g, plus five Office failure-path tests that the ingress-carrying stack fixture made stricter. Test c (preservation) passes on both.
  - The other `tests/deploy` modules: 43 failures, all from port 8082 held by a local tunnel, identical on `102dbdd`.
  - docs-lint and the structure check: pass.
  - Review: round 1 was clean in all three seats.
  - The `:599` stopped-check over the ingress stays review-only, as designed.
