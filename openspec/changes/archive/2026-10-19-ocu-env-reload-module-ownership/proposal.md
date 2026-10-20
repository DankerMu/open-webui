## Why

Two more OCU test owners evict cached modules so that a fresh import re-reads the environment, and neither restores what it owned (#507).

- **`tests/orchestrator/test_startup_warnings.py::_reload_docker_manager`** (`:23-30`) deletes `docker_manager` and every `docker_manager.*` entry, then imports a fresh `docker_manager`. The calling `unittest` classes, `PublicBaseUrlDefaultWarning` and `McpApiKeyMissingWarning`, restore only their environment variable in `setUp`/`tearDown` (`:36-43`, `:86-93`).
- **`tests/test_opencode_alias_map_drop.py::_drop_modules`** (`:38-41`) pops `cli_runtime`, `docker_manager` and `outputs_broker`. `_import_cli_runtime()` (`:44-46`) and the autouse `_scrub_opencode_env` teardown (`:49-54`) call it. The teardown removes the owned entries; it does not restore their entry-time identity or absence.

The canonical helper now exists: `tests/file_route_module_ownership.py::isolated_modules(names, prefixes)` (#504, generalized in #510).

## What Changes

- **Startup warnings.** Each of the two `unittest` classes enters `isolated_modules({"docker_manager"}, ("docker_manager.",))` in `setUp` through `self.enterContext(...)` (Python ≥ 3.11). The environment save and restore stay as they are. `_reload_docker_manager` keeps its eviction and fresh import, now inside the owned scope.
- **Alias map.**
  - Add a non-autouse fixture `alias_runtime_modules` that runs `with isolated_modules(_ALIAS_RUNTIME_MODULES): yield`, where `_ALIAS_RUNTIME_MODULES` is the existing three names, byte-identical.
  - The autouse `_scrub_opencode_env` requests it and drops its trailing `_drop_modules()`.
  - `_import_cli_runtime()` keeps dropping and importing inside the scope.
  - The ownership lives in a separate, non-autouse fixture so that the regression module can bind it without making it autouse there.
- **Import resolution.** `test_opencode_alias_map_drop.py` gains the repo-root `sys.path` insert used by `tests/test_tools.py` and `tests/test_auth_guard.py`, so its `tests.` import resolves under console `pytest`, where prepend mode puts `tests/` on the path rather than the root. `test_startup_warnings.py` runs under `python -m pytest` from the root, as CI's `build.yml:251` does, and needs no insert. Its console and docstring invocations already fail on main at `tests/orchestrator/conftest.py:5` (`No module named 'tests'`). That is pre-existing and filed separately.
- **Regressions,** in `tests/test_file_route_module_ownership.py`:
  - Startup warnings, for each class, with the owned modules present and absent at entry:
    - one real test of the class, run in-process through `unittest`'s own `TestCase.run`;
    - a sentinel-failing test-body subclass, run the same way.

    Each asserts exact restoration afterwards.

  - Alias map: `alias_runtime_modules` joins the existing ownership table, for normal completion and for the child-process body failure, with the owned modules present and absent at entry.
  - A guard asserts that `alias_runtime_modules` is in the alias tests' fixture closure, which the autouse `_scrub_opencode_env` provides.
  - Red: the startup-warning cases fail on restoration against the current owner. The alias owner's lifecycle cases exercise the new ownership fixture and are green from the start, so the alias red comes only from the wiring guard. That split is sufficient for three reasons:
    - `_scrub_opencode_env` depends on `alias_runtime_modules`, so the scrub's teardown runs first and the ownership restore runs after it;
    - the restore is covered for both entry states (present and absent) and for both outcomes (normal and failure);
    - the guard pins the dependency.

- `tests/README.md`'s module-ownership section names the two new owners.

## Capabilities

### Modified Capabilities

- `ocu-pytest-discovery`: adds the requirement "Environment-reload tests restore module ownership".

## Impact

Code in the sibling `open-computer-use` repository, tests only:

- `tests/orchestrator/test_startup_warnings.py`
- `tests/test_opencode_alias_map_drop.py`
- `tests/test_file_route_module_ownership.py`
- `tests/README.md`

Every warning and alias assertion stays unchanged. No production code changes, no helper changes, and no suite-wide reset. This repository receives the fixture and its archive only.

## Triage

- Issue type: bugfix (test isolation)
- Fixture level: standard. It is the same mechanism and helper as #510, applied to two more owners.
- Upstream suggested level: absent
- Blast radius: test-order dependence inside one pytest process; none in production.
- Selected risk packs:
  - Shared state / ordering;
  - Error / rollback: restoration after a body failure.
- Evidence floor:
  - the startup-warning regressions are red against the current owner, the alias wiring guard is red before wiring, and all are green after;
  - the two owner modules and the ownership module pass under `python -m pytest` from the root;
  - console `pytest tests/test_opencode_alias_map_drop.py` collects and passes;
  - collect-only node IDs of the two owner files and the ownership module change only by the added wiring guard and the new parametrized regression nodes;
  - the full documented unit command passes in a clean `git clone`;
  - `./tests/test-project-structure.sh` and the commit hooks pass.
