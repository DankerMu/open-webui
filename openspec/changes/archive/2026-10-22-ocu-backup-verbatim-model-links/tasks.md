## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-backup-verbatim-model-links --strict --no-interactive`.

## 2. OCU PR

- [x] 2.1 Tests first: evidence (a), (b), (c), (e) and (f) in `tests/deploy/test_recovery_fs.py` and `tests/deploy/test_recovery.py`. Record red on `origin/main` as behaviour, not as a signature `TypeError`: (a) fails with `unsafe symlink`, (e1) fails with `unsafe symlink` and the argv has no `--links`, and (f) shows the link being followed.
- [x] 2.2 D1 and D2 in `deploy/recovery_fs.py`, including the internal calls (`:333`, `:503`, `:511`) and `archive_has_regular_root_member` (`confined`). Keep the existing tests green with `links="confined"` passed explicitly, per evidence (d).
- [x] 2.3 D4 and D5:
  - the helper CLI and `capture_volume`/`restore_volume`;
  - `_copy_tree_archive` and `_archive_contains`;
  - the backup, verify and restore call sites, all using the single `LINK_POLICY` map;
  - the test callers listed in the proposal, at `test_recovery.py:1090-1092`, `:1337-1339`, `:2506-2508`, `:2711-2746` and `:2721`.
- [x] 2.4 D6 in `_index_snapshot`.
- [x] 2.5 Update `deploy/BACKUP-RESTORE.md:48-55`.
- [x] 2.6 Green:
  - `python -m unittest discover -s tests/deploy` in the CI-shaped container (`python:3.13`, uid 1001, GNU tar);
  - the local root step for (b) GNU, with `OCU_TEST_EXPECT_ROOT=1`;
  - `tar --version` recorded for both images.

## 3. Host

- [x] 3.1 Evidence (g) on the acceptance VPS from the merged SHA. Then resume #173 B-T14 (the cross-daemon restore) separately; it is not part of this change.
- [x] 3.2 File a follow-up issue in DankerMu/open-webui: a refusal after quiesce leaves the stack stopped. Covered triggers: links in deployment-owned trees, sockets or FIFOs, and hardlinks to symlinks. Propose a pre-quiesce scan, or a restart on failure.

## 4. Fork

- [x] 4.1 After the OCU PR merges, a docs PR adds the decision record `docs/decisions/implemented/architecture/<date>-ocu-backup-link-policy.md` (option 2, the rejected options 1, 3 and 4, the per-tree map, and the GNU tar proof). It goes together with the archive of this change. `make decisions-verify` and `make doc-gate` must pass.

## Risk packs

Selected:

- **File IO / path safety:** the relaxed predicate is limited to model-written trees, and the structural rules stay (D1, D2, evidence (a), (c), (d)).
- **Auth / privilege:** the root helper's extract and the host-side reads never follow links (D3, D6, evidence (b), (f)).
- **Data integrity:** links are restored verbatim (evidence (a), (g)).
- **Public API / CLI / script entry:** the required `--links` helper argument and the required keyword (D1, D4, evidence (e)).
- **Compatibility:** older tooling refuses new sets that hold absolute links (docs, 2.5).
- **Documentation:** BACKUP-RESTORE.md and the decision record (2.5, 4.1).

Not selected:

- **Performance:** unchanged.
- **Concurrency:** the quiesce and order logic is untouched.
- **Schema:** the manifest format is unchanged.
