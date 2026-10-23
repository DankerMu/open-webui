## 1. Fixture

- [x] 1.1 Compact fixture, read-only fixture review, `openspec validate ocu-deploy-tests-shared-bytecode-cache --strict --no-interactive`.

## 2. Implement (in open-computer-use)

- [x] 2.1 A/B on `f89a26e`: plain `python:3.13`, `--init`, CI deps in a venv under `/tmp`, source copied in (keep `.git`; exclude `.run`, `__pycache__`), uid 1001, no `compileall`, stdlib `.pyc` count 0 before the run. `python -m unittest test_deploy_entry test_sandbox_egress_guard` from `tests/deploy` (A) as is, and (B) with `PYTHONPYCACHEPREFIX=/tmp/pycache-ab` exported in the container. Expected: A has the two failures, B is all OK. Stop and report if A does not reproduce both failures (the A/B then neither confirms nor refutes the cause), or if B is not all OK.
- [x] 2.2 `support.fake_env`: set `PYTHONPYCACHEPREFIX` to `state_dir / "pycache"` before `extra` is applied, with a comment naming the failure mode. Remove the #620 lines in `test_recovery._cli_env` (`:695-698`).
- [x] 2.3 Confirmation grep, no change expected: every `rglob`, `iterdir`, `glob`, `os.walk`, `listdir` and `scandir` in `tests/deploy` (tests, `support.py`, `fakebin/`) either lists a subdirectory, matches a name pattern that `pycache` does not match, or runs on a tree that is not a `fake_env` state root. Report any exception instead of filtering it.
- [x] 2.4 Green, same container recipe, without the exported variable: the two modules as uid 1001 → all OK, and as uid 0 → all OK; `test_recovery` as uid 1001 → all OK. If B was green but this is not (B used one warm shared cache; the change gives each test a cold one), stop and report: do not widen waits or move the cache outside the per-test directory. Full `python -m unittest discover -s tests/deploy` as uid 1001: classify every failure or skip as pre-existing on `f89a26e` or caused here. `./tests/test-project-structure.sh`; `ruff check --select F` on the changed files.
- [x] 2.5 Report which sibling 5 s marker waits from #621's Boundary section were left unchanged, and why.

## Risk packs

Selected:

- **Config:** shared env default, `extra` precedence, cache location inside the per-test directory, 2.2, 2.3. Once the prefix is set, a root or precompiled runner no longer reads the stdlib's own `__pycache__`, so each test pays one cold compile (about 0.1 s per #620's measurement); 2.4's uid 0 run covers this.

Not selected:

- **Concurrency / shared state:** CPython writes each `.pyc` to a temporary file and renames it; the cache is private to one test's state directory.
- **Public API / CLI, Error handling, Documentation:** no production or operator-visible change.
