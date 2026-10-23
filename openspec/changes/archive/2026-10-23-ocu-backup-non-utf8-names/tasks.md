## 1. Fixture

- [x] 1.1 Compact fixture, read-only fixture review, `openspec validate ocu-backup-non-utf8-names --strict --no-interactive`.

## 2. Implement (in open-computer-use)

- [x] 2.1 Test first in `tests/deploy/test_recovery_fs.py`. Inputs, as bytes: file `b"\xd6\xd0.txt"` with contents `b"gbk\n"`; directory `b"\xb9\xfa"` holding `b"inner.txt"`; symlink `b"link"` → target `b"\xd6\xd0-target"` (`verbatim` policy). Create them with bytes paths; if the filesystem refuses (`OSError`, e.g. `EILSEQ` on macOS APFS) `skipTest` with that reason. The skip probes the filesystem, never `sys.platform`, and applies to every variant. Cases:
  - GNU capture → GNU extract and Python capture → Python extract (existing `_require_gnu_tar` / `patch.object(recovery_fs, "_gnu_tar", …)` pattern);
  - GNU capture → Python extract and Python capture → GNU extract;
  - each: `validate_archive` passes; after extract, `os.listdir(bytes)` of the root and of `b"\xb9\xfa"` returns exactly the input names, file contents are unchanged, `os.readlink(bytes)` returns `b"\xd6\xd0-target"`.
  - GNU-capture cases red on `76314ea` with `UnicodeEncodeError`.
- [x] 2.2 Test first in `tests/deploy/test_recovery.py`: backup → `verify` → restore through the fake docker harness (distinct target daemon via `_seed_restore_target` and `FAKE_DOCKER_STATE`, as in `test_restore_recreates_model_written_links_verbatim`) with a workspace volume holding the same file name; the restored volume has the same name bytes and contents. Same filesystem-probe skip.
- [x] 2.3 `capture_tree`: `os.fsencode(name)` for the file list.
- [x] 2.4 Green in `python:3.13` (Linux, non-root, CI deps): `python -m unittest discover -s tests/deploy -v` shows the new cases `ok`, not `skipped`; rerun the new GNU cases, including 2.2, with `LANG` and `LC_ALL` unset (`env -u LANG -u LC_ALL`), matching the helper image, which sets no locale; then `./tests/test-project-structure.sh`.
- [x] 2.5 Orchestrator: file the outputs-broker `UnsupportedNameError` restore limitation separately.

## Risk packs

Selected:

- **File IO / path safety:** byte-exact names through capture, validate and extract on both paths and across them, 2.1, 2.2.
- **Legacy compatibility:** existing UTF-8 archives and the Python fallback unchanged, 2.1, 2.4.

Not selected:

- **Schema / file format:** PAX archives already carry such names; no format change.
- **Error handling:** no new refusal.
- **Documentation:** no operator-visible procedure change.
