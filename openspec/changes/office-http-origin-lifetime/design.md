# Design

## Context

The four Office fake origins duplicate startup/teardown; there is no shared accepted-socket or handler owner. `_CommandOrigin` is the canonical command-response fixture consumed by save/close, session lifecycle, sweep and resolution tests. `_ContentOrigin` also has an `EncodingOrigin` subclass. HTTP1.1 content/download workers can remain blocked on keep-alive reads. Existing wrapper error lists are inspected before daemon handlers necessarily finish.

The parent real-HTTP baseline records stop returning with an unfinished live handler, followed by explicit probe release/join and socket cleanup. It does not reproduce or attribute the historical suite banner.

## Goals and boundaries

Governing invariant: a successful Office origin context exit means all its accepted sockets and request workers are retired, and all unexpected handler failures have reached the owning test. Teardown has one explicit finite deadline; it cannot report success with a live owned worker.

Preserve the four origins' URL, request-recording, hit/trap counters, response bodies/status/headers, chunk ordering, redirects, encoding negotiation and normal delays. Keep command outcomes, cancellation propagation, secret assertions, save/close state and concurrency assertions. No production or dependency change. Process-owned mocks, uvicorn fixtures and non-Office deploy/tool origins are audited but outside this cutover.

## Ownership design

- Add one small test-local lifetime owner under `tests/orchestrator/`; retain each existing origin's distinct request handler. Reuse the existing origin factories rather than invent parallel command fixtures.
- Explicitly register accepted sockets and handler threads before they can escape teardown ownership. Track startup failure as well as normal worker completion; joining only `serve_forever` is insufficient even after `server_close()`.
- Stop admissions, release fixture-owned holds and cancel fixture pacing/delays, close accepted I/O as needed, join accept-loop and handler workers against one monotonic deadline, then inspect errors. Close the listening socket on every path. No unbounded `server_close()` join.
- Held command wrappers register their existing release events with the origin owner. Preserve normal test-controlled release ordering; teardown release is a failure-path backstop, not a new route outcome. Replace fixture `sleep` delays with interruptible waits without shortening their normal delay.
- Capture unexpected responder/handler errors locally and raise them at teardown. Preserve a test-body exception when cleanup or handler failures also occur, through explicit grouping or chaining; do not replace the original failure with a later timeout. Remove obsolete wrapper-level error collectors once the owner covers them.
- Expected transport disconnects from intentional timeout/cancellation or teardown are narrowly classified at the transport boundary. An arbitrary responder exception, including a responder-raised connection error, must not be silently treated as an expected peer disconnect. No blanket `except`, global warning filter, stderr suppression or global thread hook.

## Cutover and sibling audit

Migrate `_CommandOrigin`, `_RecordingOrigin`, `_ContentOrigin`/`EncodingOrigin` and `_DownloadOrigin` to the single owner. Audit `_command_box`, `_lookup`, `_info`, `_info_origin`, direct resolution responders, and `_hold_save` consumers for release/error ownership. Keep unrelated client/subprocess lifecycle repairs outside scope unless required to meet the origin teardown invariant; preserve all existing assertions.

The initializer/startup and stop ownership paths must close resources even if a worker cannot be started. Teardown is safe to invoke after partial startup and cannot race a newly admitted handler into an untracked lifetime.

## Verification and sequencing

1. Independent expanded fixture pass and strict validation before source edits.
2. One permanent real-HTTP regression first: an unexpected responder error must reach the context owner. Parent captures original-source semantic RED; no missing-new-helper RED.
3. Implement the owner and migrate the four origin families; parent GREEN. Then add deterministic lifecycle cases for success, timeout, cancellation, exceptional body exit, keep-alive/partial input, expected disconnect classification and simultaneous body/handler failure.
4. Qualify lifecycle/error oracles with disposable missing-drain and lost-error mutants; restore candidate success. Do not mutate the live checkout for faults.
5. Run the focused fixture module and the complete Office command/router/save-close and analogous origin consumer suites under canonical pytest collection. Run an independent real-HTTP probe recording worker completion, sockets closed and failure attribution, with before/after source identities.
6. Update source changelog and the central testing decision after smoke proof, retain command evidence and secret scans, cross-review, merge source and control-plane PRs, then archive.

## Risks and containment

Python cannot forcibly terminate an arbitrary uncooperative thread. All in-scope test-controlled holds and delays therefore need explicit release/cancellation; accepted socket closure handles I/O waits. Deadline exhaustion is an owning-test failure, never a clean teardown or retry. Fault-injection tests must retain an external emergency release and join their own workers so a deliberately bad control cannot poison the next test.

Transport closure can induce `BrokenPipeError` or reset after a deliberately timed-out client; narrow classification must not hide an assertion or unrelated responder failure. Error attribution may expose genuine pre-existing test assertions: diagnose them without weakening production expectations.

Rollback is reverting the test-only cutover; no application state migration, compatibility shim or production fallback is needed.
