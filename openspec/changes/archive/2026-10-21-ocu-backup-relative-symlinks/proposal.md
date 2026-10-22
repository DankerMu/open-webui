## Why

#591: `deploy/recovery.py backup` cannot succeed on any deployment whose WebUI has started once. Found in the #173 acceptance run (B-T14) on OCU `34dc83c`: the drain and database dump succeed, then the WebUI data volume capture fails with `volume helper failed for ocu-test_open-webui-data`. Running the helper by hand shows `unsafe symlink cache/embedding/models/models--TaylorAI--bge-micro-v2/…`. The volume holds the HuggingFace embedding cache that WebUI writes at first start; its `snapshots/<rev>/*` entries are relative symlinks of the form `../../blobs/<sha>` (30 on the acceptance host), the standard HuggingFace cache layout.

Paths are in the sibling `open-computer-use` checkout at `origin/main` `34dc83c`.

- `deploy/recovery_fs.py:353-356` (`inspect_archive`): any symlink whose target is absolute or contains a `..` component fails `unsafe symlink`. `inspect_archive` runs from `validate_archive` (`:429`), which `capture_tree` calls after writing the archive (`:303`) and `extract_tree` calls before and after extraction (`:475`, `:483`). The same predicate is duplicated in the Python capture fallback (`:172-174`).
- `:357-359`: the hardlink predicate (hardlink targets are member names, where `..` is never valid). Unchanged.
- `:382-406` (`_reject_link_escapes`): no member may have a symlink or hardlink ancestor; every ancestor must be a directory. This is what makes a link's own parent chain real directories.
- `deploy/recovery_resources.py:641-653` (`capture_volume`) and `:660-672` (`restore_volume`): a non-zero helper exit raises `volume helper failed for {volume}` and drops the helper's stderr. `_run_helper` (`:610-638`) returns `release.docker`'s `CompletedProcess` with captured `stdout`/`stderr` (`release.py:223-235`). `_broker_listing` (`:1421-1433`) already appends the helper's stderr to its error; `_volume_has_marker` (`:1411-1418`) treats non-zero as "absent" by design.
- Tests: `tests/deploy/test_recovery_fs.py` (7 tests; `:38` captures a same-directory link `alias -> notes.txt`; `:85` symlink-ancestor and device members fail closed); `tests/deploy/test_recovery.py`.

## What Changes

In `open-computer-use` only (`deploy/recovery_fs.py`, `deploy/recovery_resources.py`, tests, `deploy/BACKUP-RESTORE.md`):

- **Confined relative symlinks.** One predicate decides whether a symlink target is safe, used by `inspect_archive` and the Python capture fallback: the target is non-empty and relative, after dropping `.` and empty components (as `Path(target).parts` does today), consists of k leading `..` components followed only by normal components (no later `..`), is not empty, and k does not exceed the depth of the link's parent directory below the archive root. `../../blobs/<sha>` at `models--x/snapshots/<rev>/file` (parent depth 3) is accepted; every target accepted today (no `..` at all, including `./y`, `a//b` or `.`) stays accepted except the empty target; `../x` at the root, `a/../../x`, `b/../y`, `/etc/passwd` and `..` beyond the depth are refused with `unsafe symlink`.
- **Helper failures carry their reason.** `capture_volume` and `restore_volume` include the helper's stderr (falling back to stdout), stripped and bounded to its last 2000 characters, in the `RecoveryError`, the way `_broker_listing` already does.
- **Docs.** `deploy/BACKUP-RESTORE.md` states the symlink rule and that a recovery set captured with this rule must be verified and restored with tooling that has it (older `recovery.py` refuses `..` links with `unsafe symlink`; the helper mounts the running checkout's `deploy/`).

## Capabilities

### Modified Capabilities

- `ocu-backup-rollback`: new requirements "Confined relative symlinks in captured trees" and "Recovery helper failures name their cause".

## Impact

- Backups of a started deployment publish a complete set; the HuggingFace cache is captured and restored as links to the same blobs.
- Archives that were refused before because of a confined relative link are now accepted on verify and restore; links that leave the archive root are still refused.
- This repository: the fixture and, after merge, the archive.

## Triage

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent
Blast radius: backup/verify/restore of every deployment; a too-loose rule lets a restore write a link pointing outside the destination
Selected risk packs: File IO / path safety; Error handling / rollback / partial outputs; Legacy compatibility; Documentation
Evidence floor: python -m unittest discover -s tests/deploy; ./tests/test-project-structure.sh; a real backup + verify on the acceptance host
```
