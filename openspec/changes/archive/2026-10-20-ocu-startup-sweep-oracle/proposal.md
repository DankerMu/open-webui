## Why

`tests/orchestrator/test_lifecycle.py::test_lifespan_does_not_open_docker` (`:1317-1327` on OCU `110cdf2`) claims that application startup does not construct a Docker client. It cannot show that, for three reasons (#468):

- **The guard starts too late.** The test receives the module-scoped `app_module` fixture (`:288-350`). That fixture has already entered `TestClient(loaded.app)`, and so run the lifespan, before the test body installs its raising `docker.DockerClient` guard.
- **The fixture removes the code under test.** Before entering the lifespan, `app_module` replaces `startup_idle_sweep` and `reap_known_sandboxes` with no-ops (`:325-326`). The production startup sweep never runs.
- **A raising stub could not detect a lookup anyway.** The real lifespan (`computer-use-server/app.py`) schedules `_idle_reaper` as a background task and yields without awaiting it. `_idle_reaper` runs `startup_idle_sweep` in a thread and catches and prints any `Exception`. `startup_idle_sweep` also catches per-directory exceptions. A raising constructor would be swallowed while the lifespan and `/health` still succeed.

The test therefore only shows that `/health` answers after a fixture-controlled startup. That is false assurance, not a production defect.

For a managed chat directory (one containing `.meta.json` or `.idle.json`), the real sweep (`docker_manager.py:1966-1985`) calls `_lookup_container`. That calls `get_docker_client()`, which constructs `docker.DockerClient(base_url=DOCKER_SOCKET)` and pings it when `_docker_client` is unset (`:686-693`), and then calls `containers.get(_container_name(chat_id))` (`:1024-1030`). So startup is not Docker-free when managed state exists, and the lifespan-to-sweep wiring has no dedicated assertion.

## What Changes

Test-only, in the sibling `open-computer-use` repository. Production code is unchanged.

- **Delete** `test_lifespan_does_not_open_docker`. No test using the already-entered `app_module` fixture keeps a claim about startup-time Docker construction.
- **Add** a startup-sweep wiring test that runs a fresh app in a child interpreter, following the existing `test_lifespan_refuses_invalid_sandbox_dns_without_docker` pattern (`:1330-1380`).
  - **Before the app is imported:**
    - `BASE_DATA_DIR` points at a test-owned temporary root;
    - the root holds one managed chat directory (a lowercase chat id, such as the module's `CHAT`, containing `.meta.json`) and one sibling directory without managed metadata. The sweep has no case check, so an uppercase name would create a lowercase lock twin on Linux;
    - the child environment is built explicitly rather than inherited wholesale, so the invoking shell cannot change the asserted values:
      - set: `OCU_INTERNAL_TOKEN`, `MCP_API_KEY`, `PUBLIC_BASE_URL=/ocu`, `OCU_WEBUI_ORIGIN`, `CONTAINER_IDLE_TIMEOUT=600`, `OCU_IDLE_POLL_SECONDS=30`, the temporary `BASE_DATA_DIR`, `OCU_SERVER_DIR` (for `sys.path`), the result-file path variable, and `DOCKER_SOCKET` set to a literal test value;
      - removed: `OCU_SANDBOX_DNS` and `OCU_OFFICE_DOCSERVER_URL`. Office stays disabled, so the real publication sweep returns without touching Docker (`office/publish.py:781` could otherwise reach `get_docker_client()`);
    - `docker.DockerClient` is replaced by a recording double.
  - **The recording double:**
    - records constructor `base_url`, `ping()` and each `containers.get(name)`;
    - raises `docker.errors.NotFound` from `containers.get`, so the sweep's not-found branch runs without a container object.
  - **The child keeps the real code under test:** `startup_idle_sweep`, `_idle_reaper`, the lifespan and `get_docker_client` are not replaced, and `docker_manager._docker_client` starts unset. Unrelated startup hooks may be neutralised only as the DNS test already does: `startup_preflight`, and `reap_known_sandboxes`, which cannot fire within the poll interval anyway.
  - **Completion barrier:** `app.sweep_office_publications`, which `_idle_reaper` awaits immediately after `startup_idle_sweep` returns, is wrapped. The wrapper calls the original and sets a `threading.Event` in `finally`, so the barrier marks the end of the whole startup sweep (and of the disabled publication sweep) without replacing either.
  - **The test enters `TestClient(app.app)`, waits on the barrier event with a bounded timeout, and then asserts the recorded sequence:**
    1. construction with the literal `DOCKER_SOCKET` test value;
    2. one `ping`;
    3. exactly one `containers.get` for the managed chat's container name, written as a literal (`owui-chat-<chat id>`), with no lookup for the unmanaged sibling.

    Expected values are literals, never recomputed from `docker_manager`, as the module docstring requires. The parent compares the whole ordered list, so a second construction also fails.

    **Result transport:** the child writes the recorded sequence as JSON to a file under the test's temporary root, with the path passed in an environment variable. Stdout is not parsed, because production code prints `[MCP]` lines to it, some from background threads. The child does not check the sequence itself. It exits non-zero with a diagnostic only if the barrier times out, and its barrier timeout stays below the parent's `subprocess.run` timeout so the diagnostic is not replaced by `TimeoutExpired`. The parent asserts the exit code first, then the file's sequence.

  - **The test does not count as evidence** a raising stub, an exception propagating from `_idle_reaper`, or a successful `/health`.
  - **No universal claim:** neither the test name nor its docstring claims that startup never touches Docker. The assertion is specific to the seeded managed state.

## Capabilities

### Modified Capabilities

- `ocu-lifecycle`: adds the requirement "Startup sweep verification exercises the real lifespan".

## Impact

- **Code** (sibling `open-computer-use` repository): `tests/orchestrator/test_lifecycle.py` only.
- **Unchanged:**
  - `app.py`, `docker_manager.py` and `office/sweep.py`;
  - the `app_module` fixture's no-op substitutions, which the other tests in the module rely on;
  - #306's DockerException mappings;
  - dependencies.
- **This repository** receives the fixture and its archive only.

## Triage

- **Issue type:** test-evidence correction.
- **Fixture level:** standard. One test module, an established subprocess pattern, no production change.
- **Upstream suggested level:** absent.
- **Blast radius:** test evidence only. No runtime behavior changes.
- **Selected risk packs:**
  - Concurrency / async: a bounded, deterministic wait on background work, with no sleep-based polling as the oracle.
  - Test isolation: the child-process data root, environment and Docker double are test-owned, and nothing leaks into the parent process.
- **Evidence floor:**
  - **Red:** the new test fails on the recorded-sequence assertion, not on a barrier timeout, against each of these temporary mutants:
    - `_idle_reaper` no longer calls `startup_idle_sweep`;
    - `startup_idle_sweep` returns before iterating;
    - the sweep looks up every child directory, including the unmanaged one.
  - **Old test was blind:** the deleted test passes against the first mutant. Record this as a one-off run before deletion.
  - **Green:** `tests/orchestrator/test_lifecycle.py` passes.
  - **CI form:** `python -m pytest tests/orchestrator/` passes, with its environment.
  - **Clean clone:** the full documented unit command passes in a clean `git clone`.
  - **Repo checks:** `./tests/test-project-structure.sh` and the commit hooks pass.
