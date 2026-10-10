# Lifecycle lookup evidence

## Change surface

OCU launch error tests and the two retirement catches in `_launch_locked`; no route, MCP, configuration or deployment changes. Source baseline: `03c5251`.

## Must preserve

`launch_sandbox` reports engine lookup failure as `LaunchFailed` with status500 and reason `launch_failed`, without creating, removing, starting or unpausing a sandbox. Retirement APIError remains `MigrationRequired` with status409; ordinary start/unpause refusal and restart timeout retain their existing distinctions. The app fixture's restoration assertions and route consumers remain intact.

## Governing invariant

A failed engine observation cannot become an engine mutation or an unstructured consumer error; a retirement refusal cannot be reclassified from migration-required into launch-failed by unreachable defensive code.

## Sibling surfaces

The engine lookup is shared by lifecycle callers; only explicit launch translation is under test here. Running and restarting launch branches call the same retirement owner. `_ensure_retired_before_reaping` already consumes its translated MigrationRequired. App launch response and MCP wrappers consume LifecycleError; their payload/mapping contracts do not change.

## Seams under test

Inject Docker lookup failure through the existing client's lookup or container reload dependency, not by replacing `launch_sandbox` or asserting source text. Assert exception class/status/reason and absence of engine mutations. Keep unpause coverage separate. Exercise the real app launch route through TestClient and its existing isolated Docker seam for consumer smoke.

## Required evidence

1. Added lookup case passes against current behavior; removing the lookup exception translation in a disposable/in-memory mutant makes that same case fail with an unstructured Docker exception. Restore canonical behavior and run the focused module. The mutant never modifies committed production sources.
2. Running and restarting retirement refusal retain status409/reason `migration_required`, no deletion or unsafe transition, after removing only unreachable catches.
3. The focused lifecycle suite passes with the known fixture-restoration teardown preserved; no tautological replacement test, source-text assertions or new skips.
4. A throwaway HTTP launch probe receives status500 and `reason=launch_failed` on engine lookup refusal with zero create/start/unpause/remove operations. It invokes the real route and launch owner; only Docker is substituted.

## Non-goals

No engine-side Docker integration, LAN/deployment certification, WebUI mapping change, lock refactor, new retry policy, broader test cleanup or archive-history edits. Existing unrelated `.run/` data in the OCU checkout is not touched or committed.

## Review focus

Verify the callee translates every reachable retirement APIError before deleting the catches; both call sites retain MigrationRequired propagation. Verify the lookup test hits the actual lookup seam, catches raw-exception regression, checks absent mutation, and does not contaminate the app fixture's module-restoration lifecycle.
