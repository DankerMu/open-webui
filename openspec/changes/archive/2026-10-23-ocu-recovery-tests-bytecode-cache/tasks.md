## 1. Fixture

- [x] 1.1 Compact fixture, read-only fixture review, `openspec validate ocu-recovery-tests-bytecode-cache --strict --no-interactive`.

## 2. Implement (in open-computer-use)

- [x] 2.1 Reproduce on `4d59f38`: plain `python:3.13`, CI deps in a venv under `/tmp`, source copied into the container, `--user 1001:1001`, no `compileall`, no extra `-e`: `python -m unittest test_recovery` from `tests/deploy`; record the result and the two `TimeoutExpired` test names. Also as uid 0.
- [x] 2.2 `_cli_env`: default `PYTHONPYCACHEPREFIX` to `self.root / "pycache"` (an `extra` value wins). Check every subprocess in `test_recovery.py` that starts the launcher gets its env from `_cli_env` (`run_cli`, and the `Popen` sites at `:848`, `:890`). The four fixture helpers that use `self.env` directly (`_seed_chat` `:239`, `_seed_office` `:282`, `_read_restored_epoch` `:293`, the direct fake-docker call at `:1175`) run outside the `run_cli` timeout and are out of scope.
- [x] 2.3 Green: 2.1's command as uid 1001 → all OK; as uid 0 → all OK. Record the wall time of the slowest `activate` `run_cli` call in the two named tests for both uids, measured inside the full-module run of 2.1 (where the timeouts appeared) with temporary local instrumentation that is not committed. Expected: below the 30 s budget for both uids; the figures and the margin go into the PR's runtime evidence. Full `python -m unittest discover -s tests/deploy -v` as uid 1001 without precompile: classify each failure as pre-existing on `4d59f38` or caused here. `./tests/test-project-structure.sh`.

## Risk packs

Selected:

- **Config:** the test env default and its precedence, 2.2, 2.3.

Not selected:

- **Concurrency / shared state:** several fake-docker interpreters (and `up.sh`'s background `python3`) can write the same cache at once; CPython writes each `.pyc` to a temporary file and renames it into place, and the cache is private to one test.
- **File IO / path safety:** the cache lives under the per-test temporary root that is already removed in `tearDown`.
- **Public API / CLI, Error handling, Documentation:** no production or operator-visible change.
