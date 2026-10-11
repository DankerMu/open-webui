# One coherent test-owned app lifetime

## Context

The canonical `tests/` collection plus the ordered publish/store/security selection reproduces an escaped `StateCorruptError`. The actual recovery function retains a manager rooted at `/data`, while the app and current manager use the seeded temporary root. The propagated exception matches recovery's imported class, not the app's catch class. Target-alone and reversed execution also fail with HTTP500: collection alone can retain the stale Office graph, so predecessor execution is not necessary for the root mismatch.

## Goals / Non-goals

The fixture's app, recovery, broker and filesystem operations must share one test-owned root and coherent module identities for the complete client lifetime. Teardown must restore prior module objects and environment on success and assertion failure. No production module, error mapping, authentication behavior or collection-order workaround changes.

## Decisions

- Reuse `_isolated_app` and the existing client/auth pattern from `tests/orchestrator/test_outputs_endpoint.py`; do not copy its module inventory, add a second isolation helper or patch recovery into a no-op.
- Add only a thin pytest lifetime fixture around that existing context manager if needed. Make both `tmp_data` and `client` depend on that same instance. Seed the helper-owned data directory rather than maintaining a separate root patched after import.
- Use the helper's synthetic internal service token for the existing Authorization header; keep real auth middleware and all missing-token cases active. Use root-prefix configuration for these existing root-path requests.
- Close the real TestClient before the isolated-app context restores module/environment state. Do not retain a client, manager or fixture root across tests.
- Keep test bodies and assertions unchanged. This correction owns setup/teardown, not a different expected outputs result or reduced security coverage.

## Verification and qualification

Preserve `/tmp/issue-341-{ordered,alone,reversed}{,-collection}.{json,log}` and the read-only probe as baseline evidence. After repair, use the same fresh-interpreter commands with canonical collection and exact node/order gates. Require the seeded normal outputs GET to return200; immediately before GET, actual recovery and app use the same manager/root and exception classes. Identity observations diagnose coherence; the HTTP result is the consumer oracle.

A disposable lifecycle probe must exercise the repaired fixture on success and on an intentional assertion after a real successful request. Snapshot prior selected module objects and the complete environment in memory, compare after teardown without logging values, and require exact restoration plus closed client lifetime. Run the unchanged security module and the canonical outputs module using canonical `tests/` collection with an explicit file-selection expression, avoiding mixed explicit paths. Capture actual discovered/executed nodes and skips. No new permanent test of copied module inventories or fixture wiring is required.

## Risks / Trade-offs

Process-global isolation assumes serial fixture lifetimes; no parallel-thread test execution is introduced. The canonical helper owns the module list, so future graph additions belong there rather than a security-only copy. A subprocess-only fixture would hide same-process contamination and add startup cost; reuse keeps the shared lifetime contract exercised. Raw evidence must not print environment values, tokens or arbitrary exception locals.

## Migration and rollback

Test-only cutover in the existing file; revert the fixture change to roll back. Source/central scoped gates and independent expanded review precede paired merges and fixture archive. This prerequisite does not waive #199's integrated full non-image run.
