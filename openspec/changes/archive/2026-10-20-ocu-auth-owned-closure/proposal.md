## Why

`tests/test_auth_guard.py::app_module` is meant to give each test a freshly imported server, but its hand-written owned set has drifted behind `app`'s local import graph (#558). Paths are in the sibling `open-computer-use` checkout at `origin/main` `7686629`.

- `_AUTH_GUARD_MODULES` (`tests/test_auth_guard.py:52-86`) lists 33 names; the fixture (`:172-178`) owns them plus the `mcp_resources` prefix.
- A fresh `import app` loads 43 modules whose files sit under `computer-use-server/`. Ten are not owned: `cli_adapters`, `cli_adapters.claude`, `cli_adapters.codex`, `cli_adapters.opencode`, `cli_adapters.result`, `cli_runtime`, `descriptor_io`, `office.lookup_admission`, `office.transaction_workers` and `sandbox_dns`. `docs_html` (`app.py:607`, lazy) is also unowned.
- Two of the unowned modules bind owned ones at import time: `office/lookup_admission.py:12-15` binds `descriptor_io`, the `docker_manager` module object and `StateCorruptError` from `.store`; `cli_runtime.py:28-34` binds `_execute_bash_capture` from `docker_manager`. The fixture's second generation therefore runs on a fresh `docker_manager` and `office.store` together with a cached `office.lookup_admission` and `cli_runtime` that still point at the first generation's objects.
- No current auth test reaches those bindings (`165 passed`; the auth fixture clears the Office env, so the sweep returns before `lookup_admission`). The risk is latent and order-dependent. The set drifted twice already: `f97542e` added `office.transaction_workers` and `8dd1cdf` added `office.lookup_admission` without touching it.

## What Changes

- **Own the server directory by name and prefix.** `_AUTH_GUARD_MODULES` gains `cli_adapters`, `cli_runtime`, `descriptor_io`, `docs_html` and `sandbox_dns`; the twenty literal `office.*` entries are replaced by the new `_AUTH_GUARD_PREFIXES = ("mcp_resources", "office.", "cli_adapters.")`, which subsumes them. `app_module` passes both constants to the existing `isolated_modules` helper. Every module under `computer-use-server/` is now owned, except the standalone `drawio/` script directory, which the server never imports (only `tests/test_prepare_drawio.py` loads it, as the top-level module `prepare_drawio`).
- **A drift guard in `test_auth_guard.py`.** Using `app_module`, it asserts that every `sys.modules` entry whose file resolves under `computer-use-server/`, excluding the `drawio/` script directory, is matched by the owned names or prefixes. It runs under CI's `pytest tests/test_auth_guard.py` and is red on the current set.
- **A two-generation identity test in `test_auth_guard.py`.** Two sequential owned imports of `app`; inside the second, `office.lookup_admission.docker_manager` and `cli_runtime._execute_bash_capture` belong to the current `docker_manager`, and `lookup_admission.StateCorruptError is office.store.StateCorruptError`. Red on the current set.
- **Bindings and docs.** `test_file_route_module_ownership.py:36` reads `_AUTH_GUARD_PREFIXES` instead of the hardcoded `("mcp_resources",)`; the child template already takes its prefixes from `OWNERSHIP`. `tests/README.md:89` and `:94` describe the new set.
- **Siblings are a follow-up.** `_WS_SERVER_MODULES` and `_FILE_ROUTE_MODULES` have the same class of gap. The issue leaves that to triage; this change keeps the issue's S scope, and a follow-up issue is filed for the two sibling owners.

## Capabilities

### Modified Capabilities

- `ocu-pytest-discovery`: adds the requirement "Auth-guard fixture owns the server's local import closure" and extends the Purpose.

## Impact

Tests only, in the sibling `open-computer-use` repository:

- `tests/test_auth_guard.py`
- `tests/test_file_route_module_ownership.py` (one line)
- `tests/README.md`

No production code. `isolated_modules`, the WebSocket and file-route sets, every auth 401/403/404 assertion and every existing ownership regression stay unchanged. This repository receives the fixture and its archive only.

## Triage

- Issue type: bugfix (test isolation)
- Fixture level: standard. Test-only, size S, on the reviewed #504/#510 helper.
- Upstream suggested level: absent (issue says p3)
- Blast radius: test-order dependence inside one pytest process; none in production.
- Selected risk packs:
  - Shared state / ordering: cross-generation module identity in the auth fixture.
  - Compatibility: the auth owner evicts more modules per test; sibling consumers of the owned-set constant.
  - Documentation / migration notes: the README owner description.
- Evidence floor:
  - both new tests red on the current set, green after;
  - two mutants: drop `cli_runtime` from the names; drop `office.` from the prefixes; each makes both new tests red;
  - CI-parity console `pytest tests/test_auth_guard.py -v` from a clean clone root: `167 passed`;
  - `tests/test_file_route_module_ownership.py` green;
  - `--collect-only -q tests/test_auth_guard.py`: the previous 165 node IDs plus exactly the two new ones;
  - after review is clean, the two-phase clean-clone evidence;
  - `./tests/test-project-structure.sh` and the commit hooks pass.
