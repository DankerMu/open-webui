## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Before any edit, run the existing `test_lifespan_does_not_open_docker` against a temporary mutant in which `_idle_reaper` skips `startup_idle_sweep`. Record that it passes (the old oracle is blind), then revert the mutant.
- [x] 2.2 Add the child-process startup-sweep wiring test to `tests/orchestrator/test_lifecycle.py`:
  - test-owned `BASE_DATA_DIR` with one lowercase managed chat directory (`.meta.json`) and one unmanaged sibling;
  - an explicitly built child environment: token, MCP key, prefix, WebUI origin, idle settings, data root, `OCU_SERVER_DIR`, the result-file path and a literal `DOCKER_SOCKET` are set; `OCU_SANDBOX_DNS` and `OCU_OFFICE_DOCSERVER_URL` are removed;
  - a recording `docker.DockerClient` double whose `containers.get` raises `docker.errors.NotFound`;
  - a completion barrier: a wrapper around `app.sweep_office_publications` that calls the original and sets an event in `finally`;
  - the real `startup_idle_sweep`, `_idle_reaper`, lifespan and `get_docker_client`, with `_docker_client` unset;
  - a bounded wait below the parent's subprocess timeout, a JSON record written to a file under the temporary root (path passed in an environment variable, stdout not parsed), and parent assertions, first on the exit code, then on the whole ordered list against literals: construction with the literal socket, one `ping`, and exactly one `containers.get` for `owui-chat-<chat id>`.
- [x] 2.3 Delete `test_lifespan_does_not_open_docker`.
- [x] 2.4 Capture red: the new test fails on the recorded-sequence assertion against each of the three temporary mutants named in the proposal (no sweep call, early return, every child looked up). Revert each mutant and confirm that production files are byte-identical to `origin/main`.

## 3. Verify

- [x] 3.1 Run:
  - `tests/orchestrator/test_lifecycle.py`;
  - the CI form `python -m pytest tests/orchestrator/` with `OCU_INTERNAL_TOKEN=ci-internal-token MCP_API_KEY=ci-mcp-token`;
  - the full documented unit command in a clean `git clone` (exit 0);
  - `./tests/test-project-structure.sh`;
  - the commit hooks.

Recorded at archive:

- Merged as DankerMu/open-computer-use#147 (`5b6aeda`, head `5258dac`).
- Old test was blind: under the mutant in which `_idle_reaper` skips the sweep, `test_lifespan_does_not_open_docker` passed. All three planned mutants failed on the record assertion, not on the barrier. The test-evidence seat killed 8 more mutants (reaper order, unawaited sweep, missing ping, wrong socket, double lookup, `.meta.json` filter, container name). A mutant that removes the `_docker_client` cache survives because only one managed chat is seeded; this is outside the spec.
- Review round 1: both seats clean. A plausible CI risk bought fix pass 1: the fully literal child environment could miss setup-python's `LD_LIBRARY_PATH`. The fix passes through only `LD_LIBRARY_PATH`, `DYLD_LIBRARY_PATH`, `PATH` and `SYSTEMROOT`. A leak check showed that `OCU_SANDBOX_DNS`, `OCU_OFFICE_DOCSERVER_URL` and `DOCKER_SOCKET` from the shell stay out. In a `python:3.13-slim` container the test passed, but that image does not exercise the `LD_LIBRARY_PATH` path. Round 2 was clean.
- Clean `git clone` of the head, macOS, Python 3.13.3:
  - CI form: 2888 passed, 5 skipped, 5 deselected, 3 subtests passed.
  - Full unit command, run in parallel with the CI form: 4081 passed. 4 `tests/deploy` signal-timing tests failed under the doubled CPU load.
  - `tests/deploy` alone in a fresh clone: 419 passed, 410 subtests passed.
- Deviation: 5 Office refused-connection cases were deselected. They connect to a bound, non-listening `127.0.0.1` socket, which times out instead of being refused while the host's Tailscale network extension is connected. This affects `main` too and is tracked by #566.

## Risk packs

Selected:

- Concurrency / async: completion of the background startup sweep is observed through the next reaper step (the wrapped publication sweep) with a bounded timeout. A timeout fails with a diagnostic, and no sleep loop is used as the oracle.
- Test isolation: the child interpreter owns its imports, data root, environment and Docker double. The parent process's modules and `_docker_client` are untouched.

Not selected:

- Auth, schema, dependencies, public API, packaging: no production change.
