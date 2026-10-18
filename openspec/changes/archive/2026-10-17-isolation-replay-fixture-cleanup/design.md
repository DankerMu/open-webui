# Design

## Context

The replay owner creates one fixture, starts and stops the first stub, then starts and stops the second stub using the same fixture. Both inner `finally` blocks already stop their process; neither removes the shared fixture. `assert_named_office` and `_StubContext` demonstrate exact-path unlink ownership and remain unchanged.

## Decisions

Use one outer `try/finally` beginning immediately after successful fixture creation and enclosing both existing stub lifetimes. Its finalizer unlinks that exact fixture with the existing missing-ok convention. Keep each existing inner stop finalizer and all assertion bodies/order intact. This avoids a new context-manager abstraction and migrating already-correct siblings.

Startup failures remain owned by `start_stub`: its readiness-failure path kills/waits and removes its record before raising. The outer fixture finalizer covers first and second startup failure as well as assertion failure in either run. Do not add process retries, broaden exception suppression, change process deadlines, or modify the shared startup/stop helper in this issue.

## Verification

- Treat issue361's persisted success-path leak as the accepted counterexample; preserve its link, not another confirmation run.
- Before repair add one behavioral regression through the actual replay owner with real temporary configuration and a real admitted stub. Inject an early assertion failure, observe the exact fixture still exists before rescue on historical source, then require removal after repair. Preserve the original injected exception.
- Expand independent probes across first/second startup readiness failure, first-run assertion failure, second replay failure and normal completion. Wrap and delegate actual fixture/start/stop boundaries to record fixture bytes and child identity. At owner return/raise, inspect exact file absence and child exit before emergency rescue; unrelated private-root canary remains unchanged.
- Run actual `make smoke-stub` with a private runtime TMPDIR and assert no `ocu-office-fixtures-*.json` remains. Reuse #210's published pagination fault controls from its archived evidence: both semantic faults must remain rejected and the restored smoke must pass. No need to invent alternate pagination mutations.
- Select the focused pytest module and relevant scoped lint/coverage per repository conventions; record any pre-existing advisory baseline, not a false whole-suite claim. Document ownership in existing smoke guidance after runtime proof. Strict fixture/doc/decision/format checks and expanded three-seat review precede merge/archive/manual closure.

## Risks and Non-Goals

Only successful fixture creation is owned here; partial write failure inside `_write_fixtures` and arbitrary stop-helper failure are separate helpers and not redesigned. No unrelated file removal, new package, production route change, all-harness cleanup guarantee, Docker/LAN operation or timing/SLO claim. The real-process probes require local loopback listeners. Emergency cleanup belongs to the parent probe and cannot satisfy the owner assertion.

Rollback is the focused owner-finalizer change and its regression; no persisted runtime migration. Update an existing decision only if its current contract needs this specific ownership clarification; do not add a redundant decision for a narrow missing-finalizer fix.
