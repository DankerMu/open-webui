## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Red: add the addressing cases (`test_sandbox_addressing.py`: `test_host_port_zero_is_unassigned`, `test_unassigned_gateway_binding_raises_capability_fault`, `test_host_port_zero_binding_raises`, `test_unassigned_binding_on_a_stopped_container_is_unavailable`), the membership case (`test_network_membership.py::test_unassigned_gateway_publication_raises_without_mutation` with `client.assign_published_ports = False`) and the route cases (`test_auth_guard.py::TestUnassignedPublication`, raising `app_module.GatewayPublicationUnassigned`). Modify `test_missing_publication_is_unavailable_even_with_container_ip` to pass `bindings={}` (no-binding case) and parametrize `test_ws_recheck.py::test_lookup_exception_closes_1011` over `RuntimeError` and the typed fault. Record the red run: failures at the expected assertions (or the ImportError for the addressing module before the class exists), no setup errors.
- [x] 2.2 `docker_manager.py`: `GatewayPublicationUnassigned`, `_unassigned_publication`, the `"0"` condition in `_published_address`, the lookup re-raise; `app.py`: import the fault, the four routes (JSON routes through `_lifecycle_http_error`; status routes return the additive payloads); `FakeClient.assign_published_ports` knob. Green: `test_sandbox_addressing.py`, `test_network_membership.py`, `test_auth_guard.py`, `test_ws_recheck.py`.
- [x] 2.3 Mutants A and B per design.md; record the red sets (A: the two `"0"` cases; B: the addressing and membership raise cases, route cases green); restore byte-identical (`cmp`).
- [x] 2.4 `tests/orchestrator/test_engine_gateway_publication.py` (opt-in; both `SANDBOX_PUBLISHED_PORTS`; real `get_container_service_address`; create-then-start; force-remove by name). Run it on this machine with `OCU_ENGINE_PROBE=1` and `OCU_ENGINE_PROBE_OUT` under the scratchpad `i442/` directory; attach the JSON record and the pytest output; run it once without the variable to show the skip reason; afterwards show `docker ps -a --filter label=managed-by=ocu-engine-probe` and `docker network ls --filter name=ocu-engine-probe` empty.
- [x] 2.5 README `### Sandbox network host support` note after the configuration table.

## 3. Verify

- [x] 3.1 Run:
  - `test_sandbox_addressing.py`, `test_network_membership.py`, `test_auth_guard.py`, `test_ws_recheck.py`;
  - the CI-form `python -m pytest tests/orchestrator/` (the new module collects and skips without `OCU_ENGINE_PROBE`);
  - after review is clean, the two-phase clean-clone evidence: the full unit command and the CI form, then `tests/deploy` alone;
  - `./tests/test-project-structure.sh`;
  - the commit hooks.

## 4. Archive (in this repository)

- [x] 4.1 `docs/evidence/issue-442/2026-10-20-docker-desktop-gateway-publication.md`: boundary (observation vs explanation; native Linux untested; probe image platform), probe commands, verbatim probe table, the qualification-test record, the statement that #197's acceptance criteria are unchanged and its 14-test zero-failure production-profile result stays valid evidence (AC5), next step.
- [x] 4.2 Post the slice result on #442 with the open items (AC1 Linux row, AC2) and the AC3 layer statement; the issue stays open. File the follow-up issue for showing `reason` in the preview SPA and WebUI. Note on #197 that its BrowserViewer/download item needs a native Linux engine regardless of this slice and that its acceptance criteria are unchanged.

## Risk packs

Selected:

- Compatibility: six `get_container_service_address` call sites; `None` semantics preserved for absent, stopped and unbound containers; loopback/wildcard narrowing unchanged; WS `1011` unchanged.
- Error paths / contract: typed fault status 503, reason `gateway_publication_unassigned`, message names port and requested host IP; status payloads additive; JSON routes in the `_lifecycle_http_error` shape.
- Shared state / ordering: the fake engine knob defaults to the current behavior; existing membership cases untouched except the one declared in 2.1.
- Documentation / migration notes: README note (task 2.5) and the evidence record (task 4.1).

Not selected:

- Auth: the guard runs before every lookup; the protected-route list is unchanged.
- Resource limits, file IO / path safety, schema, dependencies, secrets: unchanged. The opt-in engine test force-removes its own container and network by name.

## Recorded at archive

- OCU PR: DankerMu/open-computer-use#157, head `f8780b8eae39ab1f839e901e34a7ad12039aa270` (rebased onto `9b0faf3`, patch unchanged), merged at `837af23933650850fa9a91d8f07916994e52056a`.
- Review: expanded cross-review, round 1 at `f8780b8` clean on both seats; 0 fix passes. P3 noted, not fixed: the engine test's `finally` swallows only `NotFound` on container removal; the membership raise test asserts network ops and status but not the fake's start/unpause counters. Two wording notes corrected in the PR body and this fixture (no log line is added; the WS `unassigned` cases are green from red B on).
- Clean-clone evidence at the head: full unit command minus `tests/deploy` 3705 passed, 6 skipped; CI-form orchestrator 2907 passed, 6 skipped, 3 subtests passed; `tests/deploy` alone 419 passed; all exit 0.
- Earlier evidence: red A (ImportError/AttributeError before the class exists) and red B (class, predicate and import staged) 8 failed / 20 passed at the predicted assertions; green 18/73/72/171, post-rebase 369 passed / 1 skipped; mutants A (2 failed) and B (3 failed) with byte-identical restores; engine test on this machine 1 passed with verdict `unassigned` for both ports, skipped without the variable, cleanup checks empty; `./tests/test-project-structure.sh` OK.
- Deviations accepted: the fault class is read from the module at call time in the addressing tests (neighbouring suites reload `docker_manager`); red B also staged `_unassigned_publication` and the `app.py` import; `_unassigned_publication` asserted directly in two new cases; `docker.from_env()` inside the ping `try`.
- Issue state: #442 stays open for AC1's native Linux row and AC2; AC3's user-visible half is #579. Slice result posted on #442, boundary note on #197.
- Reported, not fixed: the fake engine rewrites `HostConfig.PortBindings` with assigned ports while the real engine keeps the request shape; `app.py` binds the fault class at import, so a reload after app import would mismatch the route `except` (same class as the recorded `LifecycleError` note in `test_lifecycle.py`).
