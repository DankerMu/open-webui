## Why

#620. In the sibling `open-computer-use` checkout at `main` `4d59f38` (after #609):

- `tests/deploy/test_recovery.py` `run_cli` (`:699-708`) starts the recovery launcher with `timeout=30`. Every docker call inside it runs `tests/deploy/fakebin/docker`, a Python script, in a fresh interpreter.
- The stock `python:3.13` image ships no stdlib `.pyc`, and a non-root user cannot write them under `/usr/local/lib/python3.13`, so every interpreter start recompiles the stdlib modules it imports (0.156 s per fake-docker start as uid 1001 against 0.062 s as root).
- Result as uid 1001, no extra `-e`: `test_recovery` → `Ran 56`, `errors=2`, both `TimeoutExpired` in the `activate` call of `test_activation_uses_selected_up_and_leaves_sandboxes_stopped` and `test_interrupted_selected_source_publication_retries_same_delivery`. As root: 56 OK. With `PYTHONPYCACHEPREFIX` pointing at a writable directory, the activation test drops from about 82 s to 21 s as uid 1001.
- Hosted CI does not run `tests/deploy` (the OCU Build workflow is disabled), so this CI-shaped local run is the only gate.

## What Changes

In `open-computer-use`, tests only:

- `_cli_env` sets `PYTHONPYCACHEPREFIX` to a directory under the test's temporary root (`self.root / "pycache"`), unless the caller's `extra` sets it. Every process `run_cli` starts, including fake binaries, inherits it, so the first interpreter in a test compiles into the cache and later ones reuse it.
- The `Popen` signal cases (`:848`, `:890`) already take `_cli_env` and inherit the value. Fixture helpers that use `self.env` directly (`_seed_chat`, `_seed_office`, `_read_restored_epoch`, one direct fake-docker call) run outside the `run_cli` timeout and stay unchanged.
- `run_cli`'s 30 s timeout is not changed.

Must preserve:

- uid 0 results unchanged (56 OK at `4d59f38`);
- the `OCU_ADMIN_CREDENTIALS_FILE` default and `extra` precedence from #609;
- no file written outside the test's temporary root.

Out of scope: other `tests/deploy` modules (not measured as failing), the fake binaries' contract, re-enabling hosted CI.

## Capabilities

### New Capabilities

- `ocu-deploy-test-runtime`: requirement "Recovery CLI tests pass as non-root in the stock image".

## Impact

`python -m unittest test_recovery` passes as uid 1001 in the plain `python:3.13` image with no precompile step, so the recovery CLI has a working non-root gate.

## Triage

```text
Issue type: test
Fixture level: compact
Upstream suggested level: absent (issue says S); compact: one test-environment variable, no production change
Blast radius: test runtime only
Selected risk packs: Config (test env variable and precedence)
Evidence floor: python:3.13, CI deps, no precompile, no extra -e: `python -m unittest test_recovery` as uid 1001 → all OK (red on 4d59f38 with the two TimeoutExpired), as uid 0 → all OK; wall time of the slowest activate call recorded for both uids; full `unittest discover -s tests/deploy` as uid 1001 classified; ./tests/test-project-structure.sh
design.md: omitted at compact level
```
