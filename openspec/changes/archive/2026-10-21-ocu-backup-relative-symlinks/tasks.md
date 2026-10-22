## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-backup-relative-symlinks --strict --no-interactive`.

## 2. Implement (in open-computer-use)

- [x] 2.1 Tests first in `tests/deploy/test_recovery_fs.py`: the HF-cache tree capture/extract round trip on the GNU tar path (assert `_gnu_tar()`, else skip with `GNU tar unavailable (bsdtar on macOS)`) and on the Python fallback (force `_gnu_tar` false), the compatibility round trips (`./y`, `b//y`, `.`, `./`, `..` with k ≤ d, cross-directory link inside the root), the refused hand-built archives (destination left empty), and the escaping capture. Red on `34dc83c`: record the Python-fallback HF round trip failing with `unsafe symlink` locally, and the GNU path in a Linux run (CI or a `python:3.12` container with GNU tar); record which refusal and compatibility cases already pass.
- [x] 2.2 Tests first for helper errors (`capture_volume`, `restore_volume`) with a fake `run_volume_helper`: message carries volume name and helper stderr, bounded to the last 2000 characters, stdout fallback. Red on `34dc83c`.
- [x] 2.3 `deploy/recovery_fs.py`: add `_symlink_target_confined(member_name, target)` per design.md; use it in `inspect_archive` (`:353-356`) and `_python_capture` (`:172-174`); keep the hardlink predicate.
- [x] 2.4 `deploy/recovery_resources.py`: one private formatter for helper failure detail used by `capture_volume` and `restore_volume`; `_broker_listing` may use it (same text shape); `_volume_has_marker` unchanged.
- [x] 2.5 `deploy/BACKUP-RESTORE.md`: one paragraph on the symlink rule (relative links that stay inside the captured root are preserved; absolute or escaping links fail the backup) and the tooling constraint (a set with `..` links needs recovery tooling with this rule).
- [x] 2.6 Green: `python -m unittest discover -s tests/deploy -v` locally (GNU tests skipped on macOS) and in a Linux container with GNU tar (GNU tests run), and `./tests/test-project-structure.sh`; the OCU `build.yml` unit job is disabled on the fork, so the CI-shaped container run of the full `tests/deploy` on head and 34dc83c is the evidence (design.md "Path coverage").
- [x] 2.7 Fix pass 1 (PR #161 round 1, P1): `_python_extract` on-disk parent check per design.md "On-disk parent check"; tests: the case-alias archive (case-insensitive filesystem; red on `7c425fe`) and the filesystem-independent pre-existing-symlink parent case.

## 3. Verify

- [x] 3.1 Orchestrator, acceptance host: run the merged `recovery.py backup` against the production-like deployment with an editor open, then `verify --recovery-set`; expected: backup exits 0 and `recovery.json` exists; in `validate_archive` of `webui-data.tar.gz`, symlink records whose `linkname` starts with `../../blobs/` or `../../../blobs/` number 30 (the acceptance host's HF cache); `verify --recovery-set` exits 0; bring the stack back with `deploy/up.sh`. This re-runs #173 B-T14's backup part.

## Recorded at archive

- **Implementation.** DankerMu/open-computer-use#161, merged as `e016eb6`:
  - `7c425fe` adds the predicate and the helper detail.
  - `6bb6f01` is fix pass 1, the on-disk parent check. Round 1's security seat found it: on APFS, a case-alias archive wrote outside the destination through the Python fallback.
  - Round 2 was clean.
- **CI.** The OCU `build.yml` unit job is `disabled_manually`. GNU and full-suite evidence comes from a CI-shaped `python:3.13` container instead:
  - `34dc83c`: 409 tests, failures=37, errors=2.
  - `6bb6f01`: 422 tests, failures=37, errors=4, skipped=2.
  - The 37 failures are the same set on both.
  - The two extra errors are the `test_offline_release` 20 s timeout. Run alone it failed 2 of 4 times on base and 2 of 4 on head, so it is flaky.
- **3.1, acceptance host, 2026-10-22.** Recovery ran from an `e016eb6` checkout with an editor holding unsaved text.
  - The drain, the database dump and the `ocu-test_open-webui-data` capture passed.
  - A read-only helper capture of that volume gave 171 members. `validate_archive` passed. The 30 symlinks are all `../../blobs/` or `../../../blobs/`.
  - A GNU tar extraction recreated all 30 links with the same targets and content.
  - The full backup still failed. The next component, the workspace volumes, holds 47 absolute links per volume, which the sandbox entrypoint creates (`Dockerfile:430-466`). The output now names the link; that case is #596.
  - "Backup exits 0 / `recovery.json` / `verify` exits 0" is therefore blocked on #596, not on this change. `deploy/up.sh` restored the stack.

## Risk packs

Selected:

- File IO / path safety: the predicate and its invariant; refused archives create nothing in the destination; capture/restore symmetry on both tar paths (2.1, 2.3).
- Error handling / rollback / partial outputs: helper failure reason surfaced, bounded (2.2, 2.4); a failed backup still publishes nothing (unchanged code path, covered by existing tests).
- Legacy compatibility: every link accepted at 34dc83c except the empty target stays accepted (compatibility round trips in 2.1, existing tests in 2.6); the reverse direction (old tooling refuses new sets) is documented (2.5).
- Documentation: BACKUP-RESTORE.md (2.5).

Not selected:

- Auth / secrets: helper stderr carries paths and messages only; no new credential flow.
- Concurrency, schema, config, release packaging, resource limits: unchanged.
