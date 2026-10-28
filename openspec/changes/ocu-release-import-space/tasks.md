## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec delta; fixture review; `openspec validate ocu-release-import-space --strict --no-interactive`.

## 2. Risk packs

- **Public API / CLI / script entry** — selected: `release.py import` and the recovery callers. Evidence a, c, h.
- **File IO / path safety** — selected: present roles' archives are read in place and not copied; one delivery verification. Evidence a, b.
- **Resource limits / large input** — selected: free-space precheck. Evidence f, g.
- **Error handling / rollback / partial outputs** — selected: refusal before any copy; failure paths unchanged. Evidence b, d, e, f.
- **Legacy compatibility** — selected: nothing present gives today's path. Evidence c, h, i (recovery stdout).
- **Documentation** — selected: `NETWORK-HARDENING.md` disk need and build-cache advice. Task 3.3.
- **Auth / secrets, Schema, Concurrency, Release packaging** — not selected: no credentials, no inventory format change, locks unchanged, no image recipe change.

## 3. Implement OCU

- [ ] 3.1 Tests first for design evidence a–h in `tests/deploy/test_offline_release.py` and i in `tests/deploy/test_recovery.py`; record which fail on `main`.
- [ ] 3.2 `release.py`: reorder `import_release` (acquire → pin host → `verify_archive_set(delivery)` → present roles → precheck → stage → lock → conflicts → load → verify → publish); present-role helper (only missing-image and platform errors mean not present); precheck with the exact formula; stderr summary line.
- [ ] 3.3 `NETWORK-HARDENING.md` step 3: disk need, precheck, skipping, BuildKit cache advice.
- [ ] 3.4 Green: OCU unit command for `tests/deploy/test_offline_release.py`, `tests/deploy/test_recovery.py` (existing restore tests with a retained delivery) and the other `tests/deploy` modules touching release; scripts/docs-lint gates; full unit command where the environment allows, environment-only failures shown identical to `main`.
