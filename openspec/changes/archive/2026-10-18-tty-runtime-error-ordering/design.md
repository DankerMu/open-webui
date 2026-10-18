# Design

## Context

The runtime case closes its accepted socket and then calls real `settimeout`. Client EOF can arrive between those operations. The shared transport wrapper intentionally treats EBADF during owner shutdown as expected; EOF does not prove handler completion.

## Goals / Non-Goals

- Governing invariant: the runtime regression must observe the real transport failure and complete its classification while the owner remains running, then surface that exact error once after bounded retirement.
- Must preserve: all existing error errno/identity/count and accepted/listening-socket/worker retirement assertions; the separate shutdown-time EBADF case; real sockets and HTTP upgrade.
- Non-goals: production TTY/WebSocket changes, changing shared error classification, dependencies, retry loops, sleeps, skips, unrelated HTTP consumers or the historical damaged environment.

## Decisions

- Change surface: the runtime test in `tests/deploy/test_http_origin_consumers.py`; short operational explanation in `tests/README.md`.
- Keep the actual closed socket operation. Deterministic synthetic EBADF would lose useful descriptor coverage.
- Wait boundedly for the observed request worker to finish inside the owner context. This covers classification and recording, unlike an event set just before re-raising, which still permits owner shutdown before classification.
- Record operation errno and owner state at the error seam; fail diagnostically if the operation succeeds or never runs. Check these while the owner is still active, without moving exception suppression into the test.
- Preserve cleanup on diagnostic assertion failure. Existing emergency cleanup must not become the evidence that normal owner retirement worked.
- Sibling surfaces: teardown-time timeout case in the same module; `TtyHandler.set_connection_timeout` path; shared `_transport_call`, handler error recording and bounded stop; other origin consumers.

## Evidence

- Qualified Python3.12.12/52-package diagnostic: after actual socket close, schedule shutdown before timeout; unchanged test fails `OSError not raised`, actual errno9 and stopping=true. Worker-first control passes exact exception assertions with stopping=false.
- After fix, adversarial handoff immediately after close must not let the owner stop early; real EBADF, exactly one identical surfaced error and retired resources must hold.
- A no-error injection must fail with a specific operation diagnostic; a swallowed-runtime-error mutation must fail the owner-propagation assertion. These are temporary probes, not source-text tests.
- Execute the complete consumer module, native TTY module, shared origin tests and deploy suite; preserve node inventory and existing assertions.

## Risks / Trade-offs

- A join timeout is only a deadlock bound, not a timing workaround; assert completion and keep emergency cleanup finite.
- A signal before transport classification leaves the race intact; review the ordering through the shared owner boundary.
- No inference about which interleaving occurred in the original uninstrumented failure. Rollback is a test/docs commit revert; no data migration.
