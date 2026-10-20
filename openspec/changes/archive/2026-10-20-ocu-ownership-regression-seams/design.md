## Context

Paths are in the sibling `open-computer-use` checkout at `origin/main` `f4fdaea`.

- **Helper:** `tests/file_route_module_ownership.py::isolated_modules(names, prefixes=())`. A key is owned when it is in `names` or starts with a prefix; the prefix test is at `:20` (snapshot) and `:28` (exit cleanup).
- **WebSocket owner:** `tests/orchestrator/test_ws_recheck.py`. `_reload_server()` (`:78-79`) imports `app`. `ws_server_modules` (`:82-85`) holds `isolated_modules(_WS_SERVER_MODULES, ("mcp_resources", "cli_adapters"))` and yields nothing. `app_module` (`:88-91`) requests the fixture and calls `_reload_server()`. The direct caller at `:655-660` requests the fixture by name and calls `_reload_server()`.
- **Regressions:** `tests/test_file_route_module_ownership.py`.
  - `OWNERSHIP` (`:33-39`) maps five owners to `(names, prefixes)`; `alias_runtime_modules` has no prefixes. `AMBIENT_PREFIXES` (`:44-47`) includes `mcp_resources`, so `_isolate_ambient_modules` pops every `mcp_resources*` key at test start.
  - The in-process case (`:85-134`) imports `app`, `descriptor_io` and `uploads` at the caller level (`:93-95`), records the entry snapshot, registers the restoration finalizer, then `request.getfixturevalue(owner)` (`:121`) and returns for non-file-route owners (`:124-125`).
  - The child case (`:198-243`) writes `CHILD_TEMPLATE` (`:158-193`), runs it with `subprocess.run(..., capture_output=True, text=True, timeout=180)` (`:220-226`), computes `output` (`:228`) and parses the JUnit file (`:229`). `CHILD_OWNERS` (`:137-157`) supplies imports, the fixture name and a prelude per owner.
  - Bindings `ws_app_module = ws_tests.app_module` (`:29`) and `ws_server_modules = ws_tests.ws_server_modules` (`:30`), and the child import at `:146`, resolve the fixture by name and stay as they are.
- **README:** `tests/README.md:95-98` says the WebSocket `app_module` and the direct caller both request `ws_server_modules`.

## Decisions

- **Item 1, required scope.**
  - `_WS_SCOPE = object()` at module level. `ws_server_modules` becomes `with isolated_modules(...): yield _WS_SCOPE`.
  - `_reload_server(ws_server_modules)` takes the token as a required positional parameter and checks `ws_server_modules is _WS_SCOPE`, raising `RuntimeError("fresh server import requires the ws_server_modules scope")` otherwise. The identity check makes a placeholder argument fail with the same message.
  - `app_module` calls `_reload_server(ws_server_modules)`; the direct caller does the same.
  - Mutant (a), dropping `ws_server_modules` from the direct caller's parameters, now fails in `test_ws_recheck.py` itself, in both parametrizations. `ws_server_modules` is also the module-level fixture-definition name (`:83`), so the call resolves to that object and the identity check raises `RuntimeError("fresh server import requires the ws_server_modules scope")`. The identity check is what kills the mutant; a `None` or truthiness check would let it through. Dropping the call argument as well gives `TypeError: _reload_server() missing 1 required positional argument: 'ws_server_modules'`. Both name the ownership. AC2's in-process and child paths apply to mutants (b) and (c) only.
  - `tests/README.md:95-98` is rewritten: the reload requires the scope value the fixture yields, so a caller cannot import the server outside the owned scope.
- **Item 2, prefix-owned key inside the scope.**
  - Caller level: `import mcp_resources as caller_resources` next to `:93-95`, and `import mcp_resources  # noqa: F401` next to `import app` in `test_1_entry`. The present entry state then contains a prefix-owned key for every owner with the `mcp_resources` prefix; the absent state pops it with the rest.
  - Inside the scope: after `request.getfixturevalue(owner)` and before the `FILE_ROUTE_OWNERS` return, `if owned_prefixes: importlib.import_module("mcp_resources")`. The child preludes for `auth_app_module` and `ws_app_module` gain `    import mcp_resources  # noqa: F401\n` before the sentinel failure.
  - `mcp_resources` imports `mcp_tools`, `security` and `uploads` (`computer-use-server/mcp_resources.py:43-45`). Each owner either owns those names (fresh) or shares the caller's cached module, exactly as a lazy import during a real test would.
  - Expected kills, both in the absent-entry cases: under mutant (b) the key is popped by the test, a fresh module is created inside the scope and never retired, so `restored.keys() != entry.keys()`; under mutant (c) the entry snapshot still pops it, the fresh module is created, and the exit cleanup leaves it. The present-entry cases pass under both mutants: under (b) the key is never snapshotted or evicted, so the in-scope import returns the cached caller object; under (c) `sys.modules.update(snapshot)` overwrites the fresh module with the entry object. They prove exact-object restoration of a prefix key, not the kill. Red for items 1 and 2 is mutant evidence; the baseline is green by construction.
- **Item 3, child diagnostics.**
  - Step 1, pure move: extract `_run_child_pytest(child, junit, env, timeout=180)` from `:220-243`. It runs the same `subprocess.run` with `-s` added to the child command, builds `output` from captured stdout and stderr, parses the JUnit file and returns `(completed, cases, output)`. The body-failure test calls it and keeps every assertion; its assertions read only JUnit, so `-s` changes nothing for it. `-s` is required because pytest re-enables fd capture while importing test modules (`_pytest/capture.py:874-887`); without it, import-time output goes to pytest's capture file, which `os._exit` and the timeout kill discard, and the markers below never reach the pipe.
  - Step 2, red: add `test_child_run_failure_reports_captured_output`, parametrized over `("timeout", "crash", "unparsable")`. Every child prints a marker (`ocu-module-ownership-child-marker`) at import time to stderr with `flush=True`. The timeout child then `time.sleep(120)`; the helper runs with `timeout=10`. The crash child then `os._exit(3)`, which leaves no JUnit file because JUnit is written only at session end. The unparsable case writes garbage to the `junit` path before running the crash child, so `ET.parse` sees a file that is not XML. Each case uses `pytest.raises(pytest.fail.Exception)` and asserts the marker is in the message; the crash and unparsable cases also assert the return code is in the message. Against the step-1 helper the timeout case raises `subprocess.TimeoutExpired`, the crash case `FileNotFoundError` and the unparsable case `ET.ParseError`, none a `pytest.fail`.
  - Step 3, green: the helper
    - on `subprocess.TimeoutExpired` fails with the timeout and the exception's `stdout`/`stderr`; on Python 3.13 POSIX each is bytes or `None` even under `text=True`, so the helper uses `(exc.stdout or b"").decode(errors="replace")` and the same for stderr;
    - when the JUnit file is missing, or `ET.parse` raises `ET.ParseError`, fails with the return code and `output`;
    - otherwise returns `(completed, cases, output)`.

Must preserve:

- `_WS_SERVER_MODULES`, `_AUTH_GUARD_MODULES`, `_FILE_ROUTE_MODULES` and `isolated_modules` unchanged.
- Every test and assertion in `test_ws_recheck.py` and `test_auth_guard.py`; the `--collect-only -q` node IDs of `test_ws_recheck.py`.
- The fixture-name bindings at `test_file_route_module_ownership.py:29-30` and the child import at `:146`.
- Every existing regression in `test_file_route_module_ownership.py`, including the startup-warning and alias cases.
- Production code.

## Test Plan

All commands run in `open-computer-use` with the proxy variables unset:

```
uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest … --import-mode=importlib
```

- **Red (item 3):** the diagnostics regression against the step-1 helper fails on an uncaught `TimeoutExpired`, `FileNotFoundError` and `ET.ParseError`, not on a `NameError` or other setup error.
- **Mutants, each reverted and the files byte-compared afterwards:**
  - (a) remove `ws_server_modules` from the direct caller's parameter list (`test_ws_recheck.py:657`): `test_ws_recheck.py` fails in both `[cdp]` and `[ttyd]` with `RuntimeError: fresh server import requires the ws_server_modules scope`; no `StreamableHTTPSessionManager` message.
  - (b) drop `or name.startswith(prefixes)` at `file_route_module_ownership.py:20` and `:28`: at least one absent-entry in-process case and one absent-entry child case red.
  - (c) drop it at `:28` only: same.
- **Green, during review:** `tests/test_file_route_module_ownership.py`, `tests/test_auth_guard.py`, `tests/test_file_response.py`, `tests/test_files_headers.py`, and the CI form `OCU_INTERNAL_TOKEN=ci-internal-token MCP_API_KEY=ci-mcp-token … --with pytest-asyncio --with PyYAML==6.0.2 … python -m pytest tests/orchestrator/`.
- **Unchanged:** `--collect-only -q tests/orchestrator/test_ws_recheck.py` equal before and after.
- **After review is clean:** the two-phase clean-clone evidence at the PR head.
- `./tests/test-project-structure.sh`; the commit hooks.

Non-goals:

- Changing the owned sets (#558 owns that).
- A child-pytest regression that pins the direct caller's node ID.
- Production code, `isolated_modules`, the auth fixtures.

Review focus:

- Does mutant (a) die with a message that names the ownership, not an incidental MCP error?
- Is the prefix-owned key created inside the scope on every path the kill claims, including the child?
- Does the helper report the child output on every failure shape (timeout, no JUnit, unparsable JUnit)?
- Is the `_WS_SCOPE` token the only new seam, with no second restore implementation?
