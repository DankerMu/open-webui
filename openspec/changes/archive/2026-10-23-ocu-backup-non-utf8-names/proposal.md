## Why

#616. In the sibling `open-computer-use` checkout at `main` `76314ea`, `deploy/recovery_fs.py:354` writes the GNU tar `--files-from` list with `name.encode("utf-8")`. `os.listdir` returns a non-UTF-8 file name (for example GBK bytes unpacked from a zip) with surrogate escapes, so the encode raises `UnicodeEncodeError`. Both production capture paths reach it: `capture_volume` in the helper image and `_copy_tree_archive` on the host. Backup quiesces first (`recovery_resources.py:712`), so the stack stays stopped. The issue-scribe reproduced it in the workspace image (Python 3.12.3, GNU tar 1.35) and showed that with `os.fsencode` the walk, both capture paths, `inspect_archive` / `validate_archive` (tarfile decodes with surrogateescape) and `extract_tree` keep the raw bytes of file names, directory names and symlink targets.

## What Changes

In `open-computer-use` only: `capture_tree` encodes each listed name with `os.fsencode(name)` instead of `name.encode("utf-8")`. No other code changes unless the tests below show one is needed.

Must preserve:

- existing UTF-8 archives and their tests, unchanged;
- the `_python_capture` PAX output, unchanged;
- `_run_tar` keeps its strict `text=True` stderr decode (GNU tar octal-escapes such names in its messages);
- the member-set equality check (`recovery_fs.py:370-373`) keeps comparing surrogate-escaped `str` on both sides.

Landing order: #616 before #608. `scan_tree` does not exist at `76314ea`, and the #608 fixture (`ocu-backup-prequiesce-scan`) carries no UTF-8 refusal; its review checks that it does not add one.

Known limitation, not changed here: restore runs `_require_cursor_lag` → `_broker_listing` (`recovery_resources.py:1420`, `:1454-1465`), and the outputs broker refuses a non-UTF-8 name under a chat's `outputs/` with `UnsupportedNameError` (`computer-use-server/outputs_broker.py:452-462`, `:550`), as it already does on the live listing. A chat-data tree with such a name under `outputs/` therefore backs up and verifies but does not restore. Filed separately (task 2.5).

## Capabilities

### Modified Capabilities

- `ocu-backup-rollback`: new requirement "Backup keeps file names that are not valid UTF-8".

## Impact

A workspace volume, the skills cache, or chat data outside `outputs/` with a non-UTF-8 name backs up, verifies and restores with the name's bytes unchanged.

## Triage

```text
Issue type: bugfix
Fixture level: compact
Upstream suggested level: absent (issue says S); compact: one encoding call in an existing writer, archive format unchanged
Blast radius: every backup on a tree with such a name (fails today); a wrong fix could mangle names in archives
Selected risk packs: File IO / path safety (byte-exact names); Legacy compatibility (existing archives and the Python fallback)
Evidence floor: tests/deploy/test_recovery_fs.py round trips on both tar paths and across paths, and a backup → verify → restore CLI case in test_recovery.py, all reported ok (not skipped) in the Linux CI-shaped container, GNU cases also with LANG/LC_ALL unset; GNU cases red on 76314ea with UnicodeEncodeError; ./tests/test-project-structure.sh
design.md: omitted at compact level
```
