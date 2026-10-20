## Why

The module-ownership regressions from #510 do not detect three ways the ownership contract can break (#557). Paths are in the sibling `open-computer-use` checkout at `origin/main` `f4fdaea`.

- **Direct reload caller is covered by convention only.** `tests/orchestrator/test_ws_recheck.py::_reload_server` (`:78-79`) is just `importlib.import_module("app")`. Ownership exists only when the caller also requests `ws_server_modules` (`:82-85`). The one direct caller, `TestAdmissionDeniesBeforeBackend::test_missing_auth_url_closes_1008_without_backend_lookup` (`:655-660`), requests it by fixture name. Dropping that argument keeps `tests/test_file_route_module_ownership.py` green; the only signal is an order-dependent MCP `StreamableHTTPSessionManager .run() can only be called once` error from a sibling parametrization. `tests/README.md:95-98` and the spec scenario "Direct reload caller" claim every fresh server import sits inside the owned scope.
- **Prefix ownership is unproven.** `isolated_modules(names, prefixes)` owns a key by name or by prefix (`tests/file_route_module_ownership.py:20` snapshot, `:28` exit cleanup). `mcp_resources` is imported only lazily (`app.py:463`, `:721`, `docker_manager.py:1158`), the regressions never start the lifespan, and `cli_adapters.*` stays cached behind the unowned `cli_runtime`. No prefix-owned key is ever created inside an owned scope, so removing `or name.startswith(prefixes)` at `:20` and `:28`, or at `:28` alone, leaves every regression green.
- **Child diagnostics are lost on crash or timeout.** `test_owner_restores_modules_after_test_body_failure` computes `output` (`:228`) but parses the JUnit file (`:229`) before any assertion can show it; `subprocess.run(..., timeout=180)` (`:225`) raises `TimeoutExpired` before `output` exists. A crash, a timeout or a missing JUnit file reports nothing from the child.

## What Changes

- **Direct-reload seam.** `ws_server_modules` yields a scope token; `_reload_server(ws_server_modules)` requires it and checks it. `app_module` and the direct caller pass the fixture value. Dropping the fixture argument now fails at the call site with an error that names `ws_server_modules`. `tests/README.md` describes the seam.
- **Prefix ownership is exercised.** The in-process regression and the child template import `mcp_resources` at the caller level, so the present/absent entry axis applies to a prefix-owned key, and import it again inside the owned scope before restoration is checked, so a prefix-owned key must be retired or restored. The absent-entry cases turn red under both prefix mutants.
- **Child diagnostics survive.** The child pytest run and its JUnit parse move into one helper with an injectable timeout and `-s` on the child command, so import-time output reaches the pipe. On `TimeoutExpired`, a missing JUnit file or a parse error it fails with the child's captured stdout and stderr. A new regression proves it with a sleeping child, a crashing child and a crashing child behind an unparsable JUnit path.

## Capabilities

### Modified Capabilities

- `ocu-pytest-discovery`: the requirement "Auth and WebSocket fixtures restore module ownership" gains the required-scope reload seam, prefix-key retirement and child-diagnostic scenarios.

## Impact

Tests only, in the sibling `open-computer-use` repository:

- `tests/orchestrator/test_ws_recheck.py` (the seam and its two callers)
- `tests/test_file_route_module_ownership.py`
- `tests/README.md`

No production code. The owned module sets, `isolated_modules`, the auth fixtures and every WebSocket revocation or auth assertion stay unchanged. This repository receives the fixture and its archive only.

## Triage

- Issue type: bugfix (test coverage of the ownership contract)
- Fixture level: standard. Test-only, size S, on the reviewed #504/#510 pattern.
- Upstream suggested level: absent
- Blast radius: regression strength only; none in production.
- Selected risk packs:
  - Shared state / ordering: prefix-owned keys created inside an owned scope.
  - Error / rollback: child-run diagnostics on timeout, crash, missing and unparsable JUnit.
  - Documentation / migration notes: the README seam sentence.
- Evidence floor:
  - mutant (a) fails inside `test_ws_recheck.py` with an error naming `ws_server_modules`;
  - mutants (b) and (c) each make at least one in-process and one child regression red;
  - the diagnostics regression is red against the pure-move helper (real `TimeoutExpired`, `FileNotFoundError`, `ET.ParseError`) and green after;
  - `test_file_route_module_ownership.py` and the CI-form `python -m pytest tests/orchestrator/` pass;
  - `--collect-only -q` node IDs of `test_ws_recheck.py` are unchanged;
  - after review is clean, the two-phase clean-clone evidence (full unit command, CI form, then `tests/deploy` alone);
  - `./tests/test-project-structure.sh` and the commit hooks pass.
