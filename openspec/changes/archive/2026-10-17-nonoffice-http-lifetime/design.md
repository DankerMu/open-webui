# Design

## Goal and Scope

Governing invariant: every admitted request worker and accepted connection stays inside its test owner's bounded lifetime; cleanup failures remain attributable and cannot skip other acquired owners. Migrate all five issue377 families in one atomic cutover. This is a cross-owner change, not a production HTTP redesign.

## What Already Exists

`tests/orchestrator/_http_origin.py` owns admission, workers, sockets, cooperative releases and error aggregation. It closes accepted I/O before bounded joins and tags expected disconnects only at actual transport operations. Office command/router/content/download consumers already use it; `test_http_origin.py` and `test_office_http_holders.py` exercise real retirement and exception identity. Reuse this implementation in place, not a parallel generic helper.

The current owner binds loopback port0. Deployment control listeners require existing ports8081/8080/8082, so a narrowly optional bind-address extension must retain the default and report the actual bound address. Source references were mapped after Python LSP rejected references with -32601; no cross-file rename is planned.

## Owner Matrix

| Existing owner                                                | Required migration and observable boundary                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test_tools.py::_LocalOrigin` / `_local_origin`               | Canonical managed handler/lifetime; preserve request records, response framing and redirect assertions; forward body failure through the actual context.                                                                                       |
| `deploy/support.py::serve_font_archive`                       | Same context/yielded URL and archive bytes; own incomplete-input and response workers rather than only the accept loop.                                                                                                                        |
| `deploy/test_deployment_smoke.py::OverlaySmokeCliTests`       | Own fixture server and all three fixed-port control listeners; register releases for start/stop/WebSocket holds and cleanup immediately after acquisition. One failing stop/start must not strand earlier listeners or reservations/temp data. |
| `deploy/test_init_wrapper.py::FakeWebUI` / `InitWrapperTests` | Marker polling must observe owner cancellation without deleting caller markers; preserve start/stop and request-recording behavior; all acquired resources remain cleanup-eligible on setup/body failure.                                      |
| `deploy/test_smoke_native.py` inline HTTP/TTY owners          | Use canonical lifetimes in the existing tests; register TTY init/hold releases, preserve session close, handshake and EOF assertions.                                                                                                          |

## Constraints and Non-Goals

Keep every existing behavioral assertion: redirect no-target-arrival/configuration errors/secret absence, font contents, deploy CLI outcomes, initializer state, HTTP status and TTY protocol. Keep Office defaults and lifetime/error regressions intact. No production policies, unrelated uvicorn origins, Office held-save redesign, dependencies, real Docker/LAN operation, retries or skipped cases.

Preserve pytest, deploy unittest discovery and affected `__main__` entrypoints. Canonical imports must work from direct deploy scripts as well as repository-root pytest; reuse the existing support/root-path convention rather than a module alias or second implementation. Obsolete accept-loop-only fields and cleanup code go away; retain start/stop methods only if they still own real work, not no-op compatibility shims.

## Sequencing and Verification

1. Parent freezes a real-owner counterexample before fixture changes. A partial HTTP request deterministically holds a worker; observe the original worker/socket immediately after owner exit, before emergency rescue. A deliberately failing handler separately qualifies attribution. Never infer a production leak from this test-only probe.
2. One implementer adds a meaningful consumer regression first; parent captures semantic RED. Implement the canonical extension and migrate the named owners with behavior regressions, preserving the frozen oracle and original assertions. Do not create permanent copy/wiring tests.
3. Parent exercises each family through its real context or unittest lifecycle: completed request, admitted partial/held request, body failure, handler failure, and body+handler failure where that owner exposes both. Capture thread/socket identities and completion before rescue. For multiple listeners, exercise one failure while checking every acquired listener/worker/socket; exercise partial-startup cleanup.
4. Preserve fixed-port binds and direct-script imports. Run the canonical lifetime/holder regressions, named consumer modules and font/offline-release callers with exact selected-node accounting. Run both pytest and deploy unittest/direct entrypoints where their import/lifetime boundaries differ; no whole-suite success claim from a selection.
5. After smoke proof, update the existing HTTP-lifetime decision, testing guidance and changelog; complete strict fixture/doc/decision/format checks and cross-review, then paired merge/archive/manual closure.

## Risks and Containment

Raw `connection.settimeout()` in the TTY handlers can race teardown after a released hold. Keep expected closure classification at the canonical actual-transport boundary; do not catch all handler `OSError`, suppress assertions, or add caller-specific success fallbacks. Existing protocol handling must not turn arbitrary responder failures into expected disconnects.

An initializer handler captures a marker path before polling, so merely clearing its owner's path field does not release it. Use cooperative owner cancellation while retaining normal marker-controlled behavior. A test body's failure and a handler's failure must both remain visible, including unittest cleanup records.

Register cleanup as soon as each resource is acquired; use existing unittest/context cleanup mechanisms so one cleanup exception cannot skip the rest. Attribute per-server finite bounds explicitly; multiple owned servers may consume multiple bounds. Python cannot forcibly terminate arbitrary uncooperative threads: such a survivor must fail teardown finitely, with external emergency rescue only after observations.

Fixed ports may belong to another local service. Never stop or reconfigure an unrelated service to run these tests; report that exact prerequisite if binding is unavailable. The current change does not expand access beyond loopback.

## Assumptions and Rollback

Issue235 is closed and its canonical owner is the source of truth. No unresolved product or policy choice is required. Parent-owned hash custody is not OS-enforced isolation. Roll back the focused helper/consumer cutover together; do not reintroduce duplicate lifetimes or delete unrelated data. The existing implemented decision is updated in place after runtime proof; no new decision record is needed for reuse of that mechanism.
