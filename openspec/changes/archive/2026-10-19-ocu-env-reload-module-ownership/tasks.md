## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Move only:
  - add the `isolated_modules` import to both owner files, plus the repo-root `sys.path` insert in the alias file only;
  - add `_DOCKER_MANAGER_MODULES` / `_DOCKER_MANAGER_PREFIXES`, `_ALIAS_RUNTIME_MODULES`, and the unwired `alias_runtime_modules` fixture.

  The existing tests stay green.

- [x] 2.2 Add the regressions:
  - startup warnings, class × entry state (present, absent) × body (normal, failure), through `TestCase.run`;
  - `alias_runtime_modules` in `OWNERSHIP`, with the child template's `cli_runtime` import;
  - the autouse wiring guard.

  Capture red on the startup-warning restoration assertions and on the alias wiring guard. The alias lifecycle cases are green from the start because they exercise the new fixture. Keep warning classes out of the regression module namespace, and parameterize the child template per owner.

- [x] 2.3 Wire `self.enterContext(isolated_modules(...))` in both warning classes' `setUp`.
- [x] 2.4 Make `_scrub_opencode_env` request `alias_runtime_modules` and drop its trailing `_drop_modules()`.
- [x] 2.5 Update the `tests/README.md` module-ownership section.

## 3. Verify

- [x] 3.1 Run the following:
  - red then green;
  - the owner and ownership modules;
  - `python -m pytest tests/orchestrator/test_startup_warnings.py` from the root (the CI form);
  - console `pytest tests/test_opencode_alias_map_drop.py`;
  - the collect-only comparison, which also covers the regression module;
  - the full documented unit command in a clean `git clone` (exit 0);
  - `./tests/test-project-structure.sh`;
  - the commit hooks.

Recorded at archive:

- The existing ambient snapshot and restore in the ownership module was factored into `_isolate_ambient_modules`, with no behavior change.
- Clean `git clone` of the merged head:
  - full unit command: 4071 passed, 5 skipped;
  - CI-form `python -m pytest tests/orchestrator/` (default import mode): 2879 passed, 5 skipped;
  - console alias file: 7 passed;
  - CI-form startup warnings: 6 passed.
- Review P3s routed to follow-ups:
  - the startup-warnings `__main__` script entry now needs the repo root on the path (added to #560);
  - the oracle reads the owner's constants (same class as #557).

## Risk packs

Selected:

- Shared state / ordering: exact restoration of entry objects and absence for both owners.
- Error / rollback: restoration after a failing body, with the failure still reported.

Not selected:

- Production behavior, schema, dependencies and secrets: none of these change.
