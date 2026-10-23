## Design

Change surface (OCU): `deploy/recovery_fs.py` (`scan_tree`, `_walk_tree`, `capture_tree`), `deploy/recovery_helper.py` (`scan`), `deploy/recovery_resources.py` (a pre-quiesce step in `establish_quiescence`, a `scan_volume` beside `capture_volume`), `tests/deploy/test_recovery_fs.py`, `tests/deploy/test_recovery.py`, `deploy/BACKUP-RESTORE.md`.

Must preserve:

- Every existing capture, validate and extract rule, under both policies (`ocu-backup-rollback` spec, #591 and #596 tests).
- The order of refusals: `_require_stack_matches_runtime`, then the sandbox attribution loop, then the new scan. A foreign image or an unattributed sandbox still refuses first.
- The scan runs **before the `try:`** in `establish_quiescence` (`deploy/recovery_resources.py:516`). A refusal inside that `try` runs `_stop_after_office_failure`, which stops the proxy, writers and sandboxes: exactly what this change prevents.
- Post-quiesce capture still refuses on its own; no check moves out of capture. Capture keeps failing hard on an entry that vanishes mid-walk (the tree is stopped then).
- `BACKUP-RESTORE.md`'s rule that backup never restarts the stack.
- The scan never writes: volume mounts are `ro` with no `/output` mount; the host walk uses `lstat`, `listdir` and `readlink` only.

Must add:

- `scan_tree(root, *, links, live=False) -> rows`. Requires the policy; refuses a missing or non-directory root; walks with `_walk_tree`; then applies, in one place, every source-side refusal capture makes on the production (GNU tar) path:
  - unsupported member type (socket, FIFO, device), already in `_walk_tree`;
  - `MAX_ARCHIVE_MEMBERS`;
  - a symlink refused by `_symlink_target_allowed` under the policy;
  - two scanned symlink rows sharing `(st_dev, st_ino)` (GNU tar would write the second as a hardlink member targeting a symlink, which `validate_archive` refuses); a symlink whose other link is outside the tree is accepted, as today;
  - total regular-file bytes, counted once per inode, over `MAX_ARCHIVE_BYTES` (the same sum `inspect_archive` enforces at `recovery_fs.py:439-441`);
- `live=True` (pre-quiesce only): an entry that disappears between `listdir` and `lstat`, `listdir` or `readlink` (`FileNotFoundError`, `ENOENT`, `ENOTDIR`) is skipped instead of refused. `capture_tree` calls `scan_tree(..., live=False)` and uses its rows, so capture and scan share one predicate.
- Helper: `scan --links=<policy> [--live] <source>`. `scan_volume(volume, image, *, links)` runs it with exactly `(volume, "/source", "ro")` mounted and argv `scan --links=<policy> --live /source`, and raises `RecoveryError` naming the volume and the helper's refusal.
- Pre-quiesce step inputs:
  - helper image `helper_image(runtime, "workspace")`, resolved before quiesce (today first resolved after quiesce in `backup_deployment`, `:723`);
  - chats: `host_chats`. Every initial sandbox is already required to belong to `host_chats` by the attribution loop, so this is the same set capture starts from; a volume that appears after the scan is still discovered by `_quiesce_and_discover` and captured with full checks;
  - volumes: `discover_workspace_volumes(host_chats)`. This moves its "unattributable workspace volume" refusal ahead of quiesce, deliberately;
  - trees: `chat_dir` (`chat-data`), `skills_dir` (`skills-cache`) on the host with `live=True`; the WebUI volume (`webui-data`) and each workspace volume (`workspaces`) through `scan_volume`; policies from `LINK_POLICY`;
  - the WebUI initializer marker: reuse `_volume_has_marker` (`recovery_resources.py:1444`, mounts the volume at `/target:ro` and runs the helper `probe`); refused before quiesce when missing, matching the post-capture `_archive_contains` check.

Governing invariant: a tree that the post-quiesce GNU-tar capture would refuse at scan time is refused before any container is stopped.

Sibling surfaces:

- Python capture fallback: today stores an in-tree hardlinked symlink as two symlinks; after the change it refuses it, like the GNU path. Deliberate: the archive rules no longer depend on the tar implementation. Its xattr and ACL refusals (`_read_xattrs`, `:151-166`) apply only on the fallback; GNU tar records only `user.*` and `security.selinux` (`CAPTURE_FLAGS`), so the scan does not check xattrs. Non-goal, documented.
- Restore, activate, verify: do not call the scan; unchanged.

Seams under test: `recovery_fs.scan_tree` and `capture_tree` (unit, both tar paths via the existing `patch.object(recovery_fs, "_gnu_tar", …)` / `_require_gnu_tar` pattern in `tests/deploy/test_recovery_fs.py`), the backup CLI through the fake docker harness in `test_recovery.py` (it runs the real `recovery_helper.py` with remapped mounts).

Required evidence:

- (a) Fake harness, `skills_dir` holds `link -> /etc/passwd`: backup exits non-zero naming the link; no `stopped.log`; no DocumentServer shutdown exec (`office-shutdown.json` absent); no destination or stage. Same for an absolute link in the WebUI volume. Red on `bff4f29`.
- (b) A FIFO and a socket in a workspace volume, and a FIFO in `chat_dir`: same assertions. Red on `bff4f29`.
- (c) Two in-tree hardlinked symlinks in a workspace volume: same assertions. Red on `bff4f29`.
- (a)–(c) also assert from `runs.json` that every scan run mounts exactly `<volume>:/source:ro`, has no `/output` mount, and runs `scan --links=<policy> --live /source` with the component's policy.
- (d) Unit: `scan_tree` refuses each rule above with the same message capture gives; `scan_tree` and `capture_tree` both refuse an in-tree hardlinked symlink with `_gnu_tar` patched True and False; a symlink hardlinked to a name outside the tree is accepted; a verbatim absolute link in a `verbatim` tree is accepted; an entry deleted mid-walk is skipped with `live=True` and refused with `live=False`; the scan writes nothing (listing and mtimes unchanged).
- (e) Missing WebUI marker: backup refuses before any stop.
- (f) Existing recovery, recovery_fs and helper tests stay green; a clean backup still publishes.

Non-goals: restarting the stack after a post-quiesce failure (option 2); the scan–quiesce race; disk-full, helper crash and other failures the scan cannot predict; Python-fallback xattr/ACL refusals; non-UTF-8 names (fixed by #616 before this change).

Review focus: one predicate for scan and capture; the scan before the `try:` and after attribution; read-only mounts; `live` tolerance confined to the pre-quiesce scan; each trigger tested; the Python-fallback behaviour change stated.
