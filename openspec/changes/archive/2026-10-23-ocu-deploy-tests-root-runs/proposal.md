## Why

#623. In the sibling `open-computer-use` checkout at `main` `f89a26e`, two `tests/deploy` tests fail only as root and pass as uid 1001:

- `test_sandbox_egress_guard.test_default_lock_path_is_host_stable` (`tests/deploy/test_sandbox_egress_guard.py:908-915`) deletes `OCU_SANDBOX_EGRESS_LOCK` and expects the firewall install to fail naming `/run/ocu-sandbox-egress`. `deploy/firewall/policy.py` `_ensure_lock_dir` (`:410-420`) creates that directory with `os.mkdir`; as root it succeeds, the install exits 0 (`AssertionError: 0 == 0` at `:913`), and the run leaves `/run/ocu-sandbox-egress/` and its lock file on the host that ran it (`ExclusiveLock.__exit__`, `:464-470`, only closes the fd). Production has no hook that moves `DEFAULT_LOCK_DIR` (`:29`), and adding one for a test is rejected.
- `test_recovery_fs.test_python_ownership_failure_is_explicit` (`tests/deploy/test_recovery_fs.py:148-184`) patches `os.lchown` to refuse and expects `cannot restore ownership`. `extract_tree` (`deploy/recovery_fs.py:631`) takes the GNU tar branch whenever `_gnu_tar()` is true, which it is in `python:3.13`; GNU tar as root restores the archive owner in a subprocess the patch cannot reach, so the tolerance branch in `_apply_metadata` (`:242`) sees matching ownership and raises nothing. As uid 1001 it passes only because tar cannot chown. Ten sibling tests that mean "the Python extractor" patch `_gnu_tar` to `False` (`:285`, `:293`, `:301`, `:377`, `:437`, `:501`, `:529`, `:554`, `:566`, `:721`); this one does not.

## What Changes

In `open-computer-use`, tests only, on `main` `0a1623a` or later. That base includes #621, without which `test_sandbox_egress_guard` is not green as uid 1001 in the stock image:

- `test_default_lock_path_is_host_stable`: `@unittest.skipIf(os.geteuid() == 0, ...)` with a reason that says root can create the default lock directory and that a root run would create the host's `/run/ocu-sandbox-egress`, and names #623. As non-root it runs unchanged.
- `test_python_ownership_failure_is_explicit`: wrap the `extract_tree` call in `patch.object(recovery_fs, "_gnu_tar", return_value=False)`, as the sibling Python-path tests do, so it asserts the Python extractor's refusal for every euid.

Must preserve:

- both tests keep their assertions;
- uid 1001 results unchanged (both run, both pass);
- the other root-aware tests (`test_recovery_fs.py:645`, `:699-703`; `test_recovery.py:462`) unchanged.

#623's acceptance item 4 says "tolerance branch removed"; removing the `:242` check would make the code always fail and the test would still pass, so the mutation check here makes a refused `lchown` never call `fail` instead.

Out of scope: production `deploy/firewall/policy.py` and `deploy/recovery_fs.py`; an in-process `lock_path()` test (an alternative in #623, not chosen: no `tests/deploy` test imports `policy` in-process); other modules' root behaviour.

## Capabilities

### Modified Capabilities

- `ocu-deploy-test-runtime` (added by `ocu-recovery-tests-bytecode-cache`): new requirement "Egress-guard and recovery-filesystem tests do not fail or touch host state only because they run as root".

## Impact

`test_sandbox_egress_guard` and `test_recovery_fs` pass as root as well as non-root, and a root run no longer creates the production egress lock directory.

## Triage

```text
Issue type: test
Fixture level: compact
Upstream suggested level: absent (issue says S); compact: two test-only edits
Blast radius: two tests
Selected risk packs: none beyond the default; the skip is euid-gated and keeps the test running for non-root
Evidence floor: python:3.13: `python -m unittest test_sandbox_egress_guard test_recovery_fs` as uid 0 → OK with the lock test skipped and no /run/ocu-sandbox-egress afterwards; as uid 1001 → OK with the lock test run; mutation check: the ownership test fails as uid 0 and uid 1001 when a refused lchown never calls fail (temporary, not committed); red as uid 0 on f89a26e; ./tests/test-project-structure.sh
design.md: omitted at compact level
```
