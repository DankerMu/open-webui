## Context

Paths are in the sibling `open-computer-use` checkout at `origin/main` `7686629`.

- **Helper:** `tests/file_route_module_ownership.py::isolated_modules(names, prefixes=())`. A key is owned when it is in `names` or starts with a prefix. Unchanged here.
- **Auth owner:** `tests/test_auth_guard.py`. `ROOT` and `SERVER_DIR` are inserted into `sys.path` at `:27-32`. `_AUTH_GUARD_MODULES` (`:52-86`) lists 33 names, 20 of them `office.*`. `app_module` (`:172-178`) does `with isolated_modules(_AUTH_GUARD_MODULES, ("mcp_resources",)): _apply_env(monkeypatch); import app as loaded; yield loaded`. The autouse `isolated_office_env` clears the Office env.
- **Closure.** A fresh `import app` in a bare interpreter loads 43 server-local modules. Unowned today: `cli_adapters`, `cli_adapters.claude`, `cli_adapters.codex`, `cli_adapters.opencode`, `cli_adapters.result`, `cli_runtime`, `descriptor_io`, `office.lookup_admission`, `office.transaction_workers`, `sandbox_dns`. Lazy, also unowned: `docs_html` (`app.py:607`). The only other server-local file is the `drawio/prepare_drawio.py` script. The server never imports it, but `tests/test_prepare_drawio.py:13-16` puts `computer-use-server/drawio` on `sys.path` and imports it as the top-level module `prepare_drawio`, so it is cached in `sys.modules` during the local full run (collection imports every test module).
- **Stale bindings.** `office/lookup_admission.py:12-15`: `import descriptor_io`, `import docker_manager`, `from .store import StateCorruptError`. `cli_runtime.py:28-36`: `from docker_manager import (..., _execute_bash_capture)` and the `cli_adapters` imports. `office.transaction_workers`, `descriptor_io`, `sandbox_dns` and `cli_adapters.*` bind only stdlib, third-party or each other, so sharing them is consistent but still outside the owner.
- **Readers of the set:** `tests/test_file_route_module_ownership.py:36` (`OWNERSHIP["auth_app_module"]`, prefixes hardcoded as `("mcp_resources",)`), `:141-146` (child import of `_AUTH_GUARD_MODULES`; the child's `OWNED_PREFIXES` comes from `OWNERSHIP`), `tests/README.md:89` ("each with its unchanged owned set") and `:94`.
- **Ambient cleanup:** `AMBIENT_NAMES` (`:41-43`) already contains `cli_runtime`, `sandbox_dns`, `docs_html`, `office`, `cli_adapters` and, through `_FILE_ROUTE_MODULES`, `descriptor_io`; `AMBIENT_PREFIXES` (`:44-47`) contains `office.` and `cli_adapters.`. No change is needed there.

## Decisions

- **Names plus prefixes, not ownership by origin.** Owning "every module whose file is under `computer-use-server/`" would mean a new mode in `isolated_modules` and a change to the `(names, prefixes)` contract that `OWNERSHIP` and the child template depend on. The same invariant written as a list touches nothing shared:

  ```python
  _AUTH_GUARD_MODULES = {
      "app", "auth_guard", "ws_recheck", "mcp_tools", "docker_manager", "outputs_broker",
      "context_vars", "security", "system_prompt", "skill_manager", "uploads", "file_response",
      "descriptor_io", "docs_html", "sandbox_dns", "cli_runtime", "cli_adapters", "office",
  }
  _AUTH_GUARD_PREFIXES = ("mcp_resources", "office.", "cli_adapters.")
  ```

  The twenty literal `office.*` entries are removed because the `office.` prefix subsumes them; the drift guard below is what proves coverage, so the literal list no longer carries that job. `app_module` becomes `isolated_modules(_AUTH_GUARD_MODULES, _AUTH_GUARD_PREFIXES)`.

- **Drift guard, in `test_auth_guard.py`, using `app_module`.** After the fixture has imported `app`, collect the server-local entries of `sys.modules` with this predicate, and assert each name is in `_AUTH_GUARD_MODULES` or starts with `_AUTH_GUARD_PREFIXES`; the failure message lists the unowned names:

  ```python
  DRAWIO_DIR = SERVER_DIR / "drawio"

  def _server_local_modules():
      local = {}
      for name, module in sys.modules.copy().items():
          file = getattr(module, "__file__", None)
          if not isinstance(file, str):
              continue  # builtins and namespace packages such as `tests` have no file
          path = Path(file).resolve()
          if path.is_relative_to(SERVER_DIR) and not path.is_relative_to(DRAWIO_DIR):
              local[name] = module
      return local
  ```

  The guard also enumerates every `*.py` under `SERVER_DIR` outside `drawio/` and `__pycache__`, mapped to module names (`a/b.py` to `a.b`, `a/__init__.py` to `a`), and asserts each is owned; this is what catches an unowned lazy import such as `docs_html` (`app.py:607`) regardless of test order, since the `sys.modules` view sees it only when an earlier test happened to trigger the import. `drawio/` is excluded because it is a standalone script directory the server never imports, and `tests/test_prepare_drawio.py` loads it as `prepare_drawio` during the full run; owning it would claim a module outside the server's import graph. The guard lives in the auth file so CI's console `pytest tests/test_auth_guard.py` runs it. It is red on the current set regardless of ambient state, because `import app` creates `cli_runtime` and `office.lookup_admission` inside the scope. A server-local module cached from an earlier test in the same process (for example `docs_html` from `test_file_response.py`) is owned too, so the check also holds in the local full run.

- **Two-generation identity test, in `test_auth_guard.py`, not using `app_module`.** One test with two sequential blocks, each `with isolated_modules(_AUTH_GUARD_MODULES, _AUTH_GUARD_PREFIXES): _apply_env(monkeypatch); import app`. Inside the second block:

  ```python
  manager = sys.modules["docker_manager"]
  assert manager is not first_manager  # captured inside the first block
  admission = sys.modules["office.lookup_admission"]
  runtime = sys.modules["cli_runtime"]
  assert admission.docker_manager is manager
  assert admission.StateCorruptError is sys.modules["office.store"].StateCorruptError
  assert runtime._execute_bash_capture is manager._execute_bash_capture
  ```

  `office.lookup_admission` and `cli_runtime` are always present inside the scope: `office/sessions.py:25` and `office/sweep.py:15` import the former through `app.py:32-35`, and `mcp_tools.py:171` imports the latter. Each block restores the entry state on exit, so the test leaves no residue and does not depend on order; exact restoration with the larger set is covered by the existing `test_file_route_fixture_restores_caller_modules[*-auth_app_module]` cases, not by this test. Red on the current set at `admission.docker_manager`: the first block leaves `office.lookup_admission` and `cli_runtime` cached (unowned) bound to the first generation's `docker_manager` and `office.store`, and the second block reuses them.

- **Bindings.** `test_file_route_module_ownership.py:36` becomes `(auth_tests._AUTH_GUARD_MODULES, auth_tests._AUTH_GUARD_PREFIXES)`. The child entry at `:141-146` needs no edit. `OWNERSHIP` still feeds `AMBIENT_NAMES`/`AMBIENT_PREFIXES`, which already cover every new name and prefix.

- **README.** `:89` drops "each with its unchanged owned set"; `:94` says the auth owner owns `_AUTH_GUARD_MODULES` plus `_AUTH_GUARD_PREFIXES` (`mcp_resources*`, `office.*`, `cli_adapters*`), which is the whole server directory except the `drawio/` script.

- **Siblings.** `_WS_SERVER_MODULES` and `_FILE_ROUTE_MODULES` keep their sets; a follow-up issue is filed for them. The drift guard is auth-specific on purpose: a guard parametrized over `OWNERSHIP` would be red for the two siblings today.

Must preserve:

- Every test and assertion in `test_auth_guard.py`, including the 401/403/404 matrix; the existing 165 node IDs.
- `isolated_modules`, `_WS_SERVER_MODULES`, `_FILE_ROUTE_MODULES`, `_ALIAS_RUNTIME_MODULES` and `_DOCKER_MANAGER_*`.
- Every existing regression in `test_file_route_module_ownership.py`; the auth owner still restores exact entry objects and absence with the larger set.
- Production code.

Governing invariant: inside the auth owner's scope every server-local module is owned, so the second and later generations bind only current-generation modules, and after teardown every owned key holds its exact entry-time object or is absent.

## Test Plan

All commands run in `open-computer-use` with the proxy variables unset:

```
uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest … --import-mode=importlib
```

- **Red:** add both tests before changing the set. The drift guard fails listing at least `cli_runtime`, `cli_adapters*`, `descriptor_io`, `office.lookup_admission`, `office.transaction_workers`, `sandbox_dns`; the identity test fails on `admission.docker_manager` (the `first_manager` pre-assertion passes). A collection or setup error is not red.
- **Green:** change the set and prefixes, update the `:36` binding; `tests/test_auth_guard.py` `167 passed`; `tests/test_file_route_module_ownership.py` `27 passed`; `tests/test_file_response.py` and `tests/test_files_headers.py` green.
- **Mutants, each reverted and the file byte-compared:**
  - drop `"cli_runtime"` from `_AUTH_GUARD_MODULES`: the guard lists `cli_runtime`; the identity test fails on `_execute_bash_capture`;
  - drop `"office."` from `_AUTH_GUARD_PREFIXES`: the guard lists the `office.*` modules; the identity test fails on `admission.docker_manager`.
- **CI parity:** from a clean clone root, the console form with no `PYTHONPATH` and no `--import-mode`: `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- pytest tests/test_auth_guard.py -v`, `167 passed`.
- **Unchanged plus two:** `--collect-only -q tests/test_auth_guard.py` before and after differ by exactly the two new node IDs.
- **After review is clean:** the two-phase clean-clone evidence at the PR head.
- `./tests/test-project-structure.sh`; the commit hooks.

Non-goals:

- The WebSocket and file-route sets (follow-up).
- Changing `isolated_modules` or adding an origin-based mode.
- Production code; auth-guard behavior; what #510 restores.

Review focus:

- Is every server-local module that `import app` can load, eagerly or lazily, owned by name or prefix, with the `drawio/` script directory excluded by the guard predicate and nothing in the server importing it?
- Does the two-generation test fail on the current set for the right reason, and leave no module residue?
- Does the larger owned set change any existing auth test's observable behavior (fresh `descriptor_io`, `cli_runtime`, `sandbox_dns` per test)?
- Is the `:36` binding the only reader that needed a change?
