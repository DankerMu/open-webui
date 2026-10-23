## 1. Fixture

- [x] 1.1 Compact fixture, read-only fixture review, `openspec validate ocu-deploy-tests-root-runs --strict --no-interactive`.

## 2. Implement (in open-computer-use)

- [x] 2.1 Red on `f89a26e` (root writes bytecode, so #621 does not matter here): plain `python:3.13`, `--init`, CI deps in a venv under `/tmp`, source copied in, uid 0: `python -m unittest test_sandbox_egress_guard test_recovery_fs` from `tests/deploy`; record both failures and whether `/run/ocu-sandbox-egress` exists afterwards.
- [x] 2.2 Branch from OCU `main` `0a1623a` or later. `test_default_lock_path_is_host_stable`: `skipIf(os.geteuid() == 0, <reason naming #623>)`.
- [x] 2.3 `test_python_ownership_failure_is_explicit`: `patch.object(recovery_fs, "_gnu_tar", return_value=False)` around the `extract_tree` call.
- [x] 2.4 Green, same recipe in a fresh container (not 2.1's, whose run created the directory); record `test ! -e /run/ocu-sandbox-egress` before the run: as uid 0 → OK, the lock test reported skipped, `/run/ocu-sandbox-egress` absent afterwards; as uid 1001 (`setpriv --reuid 1001 --regid 1001 --clear-groups`) → OK, the lock test run. Mutation check, temporary and not committed: with `_apply_metadata`'s refused-`lchown` path (`deploy/recovery_fs.py:239-243`) changed to never call `fail`, the ownership test fails as uid 0 and as uid 1001; restore the file and show `git diff deploy/` is empty. `./tests/test-project-structure.sh`; `ruff check --select F` on the changed files.

## Risk packs

Not selected:

- **Config, Concurrency, File IO, Public API, Error handling, Documentation:** two test-only edits; no production or operator-visible change.
