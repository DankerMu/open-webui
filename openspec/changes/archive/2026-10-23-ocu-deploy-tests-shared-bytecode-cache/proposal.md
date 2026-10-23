## Why

#621. In the sibling `open-computer-use` checkout at `main` `953fe39`, plain `python:3.13`, uid 1001, no precompile, `python -m unittest test_deploy_entry test_sandbox_egress_guard` from `tests/deploy` gives `Ran 94`, `FAILED (failures=2)`:

- `test_deploy_entry.test_checked_snapshot_is_started_after_source_mutation`: `entry never reached compose up`. The 5 s `wait_for` default (`test_deploy_entry.py:100-106`) is used at `:746` for the `entered-up` marker.
- `test_sandbox_egress_guard.test_term_during_held_restore_releases_lock`: `up never entered restore`. The 5 s `_wait` default (`test_sandbox_egress_guard.py:79-85`) is used at `:830` for the `entered-restore` marker.

Both markers are written by Python fake binaries (`fakebin/docker:261`, `fakebin/host.py:482`), and `deploy/up.sh` reaches them only after several earlier fake-binary starts. #620 (OCU `f89a26e`) showed that a non-root runner in the stock image cannot write stdlib bytecode, so every fake-binary start recompiles the stdlib. #620 set `PYTHONPYCACHEPREFIX` only in `test_recovery.py` `_cli_env` (`:698`). These modules build their env through `support.fake_env` (`support.py:348-382`), which sets no cache. Whether that is the cause here has not been checked with an A/B run yet.

## What Changes

In `open-computer-use`, tests only:

- First, an A/B run confirms the cause: the two modules as uid 1001 at `f89a26e`, without and with `PYTHONPYCACHEPREFIX` pointed at a writable directory. If the run with the variable set is not green, stop and report; this fixture does not cover a different cause.
- `support.fake_env` sets `PYTHONPYCACHEPREFIX` to a directory under `state_dir`, unless `extra` sets it. Every module that drives the fakebin directory through `fake_env`, `smoke_env` or `prepare_up_context` then inherits it: `test_deploy_entry`, `test_sandbox_egress_guard`, `test_sandbox_egress_faults`, `test_offline_release`, `test_recovery_db`, `test_deployment_smoke` and `test_recovery` (through `prepare_up_context` without `extra`, `test_recovery.py:166`). `test_bootstrap_runtime` (`:153`) and `test_retention_guard` (`:60-62`) also drive the fakebin directory but build their env from `os.environ.copy()`; they are out of scope.
- The #620 lines in `test_recovery._cli_env` (`:695-698`, comment and assignment) become redundant once `self.env` inherits the variable, so they are removed: the repo keeps one place that sets it. The cache moves from `root/pycache` to `root/fake-state/pycache`, still inside the temporary root `tearDown` removes. The removal is only valid if `test_recovery` stays green as uid 1001 without it.
- The cache must live under `state_dir`: in `test_deploy_entry`, `test_sandbox_egress_guard`, `test_sandbox_egress_faults` and `test_deployment_smoke` the state directory is the temporary root itself (`:147`, `:95`, `:45`, `:242`). No test lists the whole `fake_env` state root: every listing in `tests/deploy` is of a subdirectory (`networks/`, fonts, chat dirs) or a name pattern (`ocu-deploy-config.*` at `test_deploy_entry.py:58` and `test_sandbox_egress_guard.py:61`, `postgres-phase-*` at `test_recovery.py:1558`), and `fake_env` already puts `TMPDIR` there (`support.py:353`). The whole-tree snapshots at `test_bootstrap_runtime.py:530-547` (its own env) and `test_recovery.py:2577-2581` (`historical-target` and `destination`, disjoint from `fake-state`) do not see it. The directory name `pycache` matches none of those patterns. No snapshot filter changes.
- The 5 s waits stay as they are. If the cause is confirmed, the cache removes the slowdown and widening the waits would only hide it. The PR names the sibling 5 s marker waits from #621's Boundary section (`test_sandbox_egress_guard.py:740`, `:859`; `test_deployment_smoke.py:1003`, `:1035`; `test_init_wrapper.py:646`) and says each was left unchanged and why.

Must preserve:

- uid 0 results unchanged;
- `extra` precedence in `fake_env`;
- no file written outside the per-test temporary directory;
- snapshot tests keep asserting what they assert today about deploy state.

Out of scope: production `deploy/` code; the four copies of `wait_for`/`_wait` (#621 Boundary); `test_init_wrapper`, `test_bootstrap_runtime` and `test_retention_guard`, which do not use `fake_env`; re-enabling hosted CI.

## Capabilities

### Modified Capabilities

- `ocu-deploy-test-runtime` (added by `ocu-recovery-tests-bytecode-cache`; both changes only add requirements): new requirement "Fake-binary deploy tests pass as non-root in the stock image".

## Impact

`test_deploy_entry` and `test_sandbox_egress_guard` pass as uid 1001 in the plain `python:3.13` image, so the full `tests/deploy` discover as non-root has only its known environmental failures left.

## Triage

```text
Issue type: test
Fixture level: compact
Upstream suggested level: absent (issue says S); compact: one shared test-env default, one redundant line removed
Blast radius: test runtime of every fakebin-driving deploy module
Selected risk packs: Config (shared env default, precedence, location vs. state snapshots)
Evidence floor: A/B on f89a26e as uid 1001 (without / with the variable) for the two modules; after the change: the two modules as uid 1001 and uid 0 all OK; test_recovery as uid 1001 all OK; full `unittest discover -s tests/deploy` as uid 1001 classified against f89a26e; ./tests/test-project-structure.sh
design.md: omitted at compact level
```
