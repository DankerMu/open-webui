# Isolate the security app fixture

## Why

The normal outputs request in the security suite uses a fresh app/data root while cached Office recovery retains another manager/root; the observed ordered case also raises an exception class different from the app's caught class. [Issue341](https://github.com/DankerMu/open-webui/issues/341) is a user-approved test-only prerequisite for #199; runtime identity evidence is recorded in its diagnosis comment.

## Risk classification

- Issue type: test; fixture level: expanded because process-global modules/environment and failure teardown can contaminate unrelated cases.
- Selected packs: public API, file IO, authorization evidence, shared state/ordering, error cleanup, compatibility and documentation.
- Evidence floor: preserved pre-fix ordered/alone/reversed failures and module/root/class identities; real successful requests after isolation; unchanged security assertions; restoration after success and intentional failure.

## What Changes

- Reuse the existing canonical isolated-app lifecycle for the security fixture instead of partially replacing three modules.
- Seed files under the lifecycle's single data root and use its real app/client with coherent Office recovery dependencies.
- Preserve all path-traversal, authentication, retired-route disclosure, upload/download/archive and no-directory-creation assertions.
- Retain exact diagnosis and qualification evidence; no production repair, skipped test or CI waiver.

## Capabilities

### New Capabilities

- `ocu-outputs-test-isolation`: behavioral isolation and restoration requirements for the security suite's real outputs/app fixture. This is a test-harness contract, not a new production endpoint.

### Modified Capabilities

None. Existing `ocu-outputs-endpoint` behavior remains unchanged.

## Impact

`tests/security/test_path_traversal_app.py` fixture lifetime and source changelog; central fixture/evidence and testing rationale. Reuse `tests/orchestrator/test_outputs_endpoint.py::_isolated_app` without duplicating its module inventory or changing its shared behavior. Office, broker, auth, dependencies and pytest collection routing are outside scope. #255 remains a separate collection issue; #199 keeps its integrated full-suite gate.
