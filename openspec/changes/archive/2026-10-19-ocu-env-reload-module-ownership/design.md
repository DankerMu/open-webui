## Context

These paths are in the sibling `open-computer-use` checkout, at `origin/main` `84e001a`.

- **Canonical helper:** `tests/file_route_module_ownership.py::isolated_modules(names, prefixes=())` snapshots the owned keys, evicts them, and on exit pops every owned key and restores the snapshot.
- **The ownership regression module:** `tests/test_file_route_module_ownership.py` has:
  - an `OWNERSHIP` table that maps each fixture name to its `(names, prefixes)`;
  - the normal-completion test `test_file_route_fixture_restores_caller_modules`, which runs each owner with the owned modules present and absent at entry, through `request.getfixturevalue` and a finalizer registered beforehand;
  - the child-process body-failure test `test_owner_restores_modules_after_test_body_failure`, which runs a record test, a sentinel-failing test and a restored test, and parses the JUnit output.
- **Startup-warning owner:** `tests/orchestrator/test_startup_warnings.py` holds two `unittest.TestCase` classes and the module-level `_reload_docker_manager()`. That function evicts `docker_manager` and the `docker_manager.*` prefix, then imports `docker_manager`. The file inserts `computer-use-server` into `sys.path`. Its docstring documents `cd computer-use-server && python -m pytest ../tests/orchestrator/test_startup_warnings.py -v`.
- **Alias owner:** `tests/test_opencode_alias_map_drop.py`.
  - `_drop_modules()` pops `cli_runtime`, `docker_manager` and `outputs_broker`.
  - `_import_cli_runtime()` drops them and then imports `cli_runtime`.
  - The autouse `_scrub_opencode_env(monkeypatch)` removes the environment variables, yields, then calls `_drop_modules()`.
- **CI:** neither file appears in an explicit CI path. `test_startup_warnings.py` runs under `python -m pytest tests/orchestrator/` (`build.yml:251`), whose conftest already imports `tests.orchestrator._office_store`. Neither `tests/` nor `tests/orchestrator/` has an `__init__.py`.

## Decisions

- **Startup warnings.**
  - Add `_DOCKER_MANAGER_MODULES = {"docker_manager"}` and `_DOCKER_MANAGER_PREFIXES = ("docker_manager.",)`.
  - In both classes' `setUp`, add `self.enterContext(isolated_modules(_DOCKER_MANAGER_MODULES, _DOCKER_MANAGER_PREFIXES))` before the environment save.
  - `enterContext` registers the exit as a cleanup. Cleanups run after `tearDown` and also when the test body fails, so the environment is restored in `tearDown` and the modules are restored afterwards.
  - `_reload_docker_manager` is unchanged. Its eviction duplicates the helper's entry eviction only for keys created inside the scope, which the helper's exit retires anyway.
  - Reject converting the classes to pytest fixtures: it would change the test shape and the node IDs.
- **Alias map.**
  - Move the three names into `_ALIAS_RUNTIME_MODULES` and add:

    ```python
    @pytest.fixture
    def alias_runtime_modules():
        with isolated_modules(_ALIAS_RUNTIME_MODULES):
            yield
    ```

  - `_scrub_opencode_env(alias_runtime_modules, monkeypatch)` drops its trailing `_drop_modules()`. Its environment scrub is unchanged.
  - `_import_cli_runtime()` and `_drop_modules()` stay as they are. Their drops happen inside the owned scope.

- **Import resolution.**
  - `test_opencode_alias_map_drop.py` adds the repo-root `sys.path` insert (`parents[1]`) in `test_tools.py`'s order (root first, then the existing server-directory insert at index 0), before `from tests.file_route_module_ownership import isolated_modules`. Console `pytest` prepend mode puts `tests/` on the path, not the root.
  - `test_startup_warnings.py` adds only the import. It runs under `python -m pytest` from the root (CI `build.yml:251`), where the cwd is on the path. Its directory's conftest is loaded first and already imports `tests.orchestrator._office_store`, so an insert in the owner file could not run early enough to help other invocations.
  - The docstring command and console `pytest tests/orchestrator/...` already fail on main at `tests/orchestrator/conftest.py:5`. That is out of scope and filed separately.
- **Regressions** in `tests/test_file_route_module_ownership.py`. Access the warning classes only through `from tests.orchestrator import test_startup_warnings as warning_tests` plus attribute access; never bind a `TestCase` class into the module namespace. pytest's unittest plugin collects every `TestCase` subclass in a module namespace, whatever its name. Create the failing subclass inside the test function.
  - **Startup warnings,** a new parametrized test over class ∈ {`PublicBaseUrlDefaultWarning`, `McpApiKeyMissingWarning`} × entry ∈ {present, absent} × body ∈ {normal, failure}.
    - Snapshot the ambient state and restore it in a finalizer, following the existing pattern, with `docker_manager` and its prefix added to the ambient union.
    - Establish the entry state: import `docker_manager` with the module's `PUBLIC_BASE_URL` and `MCP_API_KEY` set, then pop it for the absent case. Record `{name: module}` for the owned keys.
    - **normal:** run `cls(<an existing test method>)` (`PublicBaseUrlDefaultWarning`: `test_silent_when_user_overrides_to_custom_url`; `McpApiKeyMissingWarning`: `test_silent_when_key_set`) through `case.run(result := unittest.TestResult())` and assert `result.wasSuccessful()`.
    - **failure:** build a subclass at runtime whose only method is `test_body(self)`, which calls `_reload_docker_manager()` and then `self.fail("ocu-module-ownership-planned-body-failure")`. Run it the same way and assert exactly one failure containing the sentinel and no errors.
    - Then assert the owned keys equal the recorded entry, by identity and by presence.

    `TestCase.run` is `unittest`'s own lifecycle, the same one pytest's unittest integration drives: `setUp`, the body, `tearDown`, then `doCleanups`. No collection or execution order is involved.

  - **Alias map.**
    - Add `"alias_runtime_modules": (alias_tests._ALIAS_RUNTIME_MODULES, ())` to `OWNERSHIP`, bound as `alias_runtime_modules = alias_tests.alias_runtime_modules`, which is not autouse. Do not bind `_scrub_opencode_env`.
    - It then runs through the existing normal-completion and child body-failure tests, with the owned modules present and absent at entry. In the in-process normal-completion path for this owner, import `cli_runtime` after `getfixturevalue("alias_runtime_modules")`, so that scope-created modules are exercised, as the spec scenario describes.
    - **Child template.** It currently hard-codes `def test_2_body(app_module)` (`:159`). Parameterize it per owner: the fixture name and the body prelude. The existing two owners keep their exact behavior. The alias entry in `CHILD_OWNERS` imports `_ALIAS_RUNTIME_MODULES as OWNED_NAMES` and `alias_runtime_modules`, never `_scrub_opencode_env`. Its `test_2_body(alias_runtime_modules)` calls `importlib.import_module("cli_runtime")` before the sentinel failure.
    - In the present state, `test_1_entry`'s `import app` loads all three owned names through `app.py:1709` → `mcp_tools.py:171`.
  - **Autouse wiring guard,** in `test_opencode_alias_map_drop.py`: `test_scrub_fixture_owns_runtime_modules(request)` asserts `"alias_runtime_modules" in request.fixturenames`. It fails if the dependency is removed.

- **Red, then green.**
  - First, move-only: add the constants and the `alias_runtime_modules` fixture without wiring it, so the regressions can bind real names. Keep `_scrub_opencode_env` unchanged.
  - Add the regressions and capture red:
    - the startup-warning cases fail on restoration, because a fresh `docker_manager` is left behind or a key absent at entry is now present;
    - the wiring guard fails.

    The new `alias_runtime_modules` owner is green from the start, because it is the helper itself. Its red is the wiring guard.

  - Then wire `enterContext` and the autouse dependency.
  - A collection, import or setup error does not count as red.

Must preserve:

- Every warning and alias assertion, and the environment save and restore.
- The owned names and prefixes, exactly.
- `isolated_modules` unchanged.
- All existing ownership regressions.
- Production code.

Governing invariant: after either owner's test finishes, normally or by a body failure, each owned key holds its exact entry-time object, or is absent if it was absent at entry.

## Seams and Evidence

All commands run in `open-computer-use` with the proxy variables unset, through `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- …`. Python 3.13 is pinned.

- **Red:** run the new regressions plus the wiring guard before the wiring.
- **Green:**
  - `tests/test_file_route_module_ownership.py`, `tests/orchestrator/test_startup_warnings.py` and `tests/test_opencode_alias_map_drop.py`, with `--import-mode=importlib`.
  - `… -- python -m pytest tests/orchestrator/test_startup_warnings.py -v` from the root, the CI form.
  - Console `… -- pytest tests/test_opencode_alias_map_drop.py -v`, with a non-zero collected count.
- **Collect-only:** compare before and after for the two owner files and `test_file_route_module_ownership.py`. The only differences allowed are the one added wiring-guard test and the new parametrized regression nodes. Any other added node, such as a re-collected `TestCase`, fails.
- **Full:** the documented unit command in a clean `git clone` of the committed head must exit 0. Any failure stops the issue.
- `./tests/test-project-structure.sh` and the commit hooks pass.

Non-goals:

- #557 (regression-strength gaps for #510) and #558 (the auth owned-set completeness);
- other module-reset owners;
- the `cli_adapters.*` modules that `cli_runtime` imports, which this owner does not own;
- production code.

Review focus:

- Is restoration exact after a normal run and after a failing body, with the owned modules present and absent at entry?
- Does `enterContext` cleanup run after `tearDown` and on body failure?
- Is the non-autouse ownership fixture bound without leaking autouse into the regression module?
- Does console `pytest` on the alias file still import, and does the CI form of the startup-warnings file still pass?
