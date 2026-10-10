## 1. Fixture and RED evidence

- [x] 1.1 Independent fixture review and strict OpenSpec validation pass before editing tests.
- [x] 1.2 Record fresh RED at the existing test boundary: disabled networking gives 8 failures; enabled networking with bind 192.0.2.99 gives 8 failures; invalid inherited CLI gives 9 failures in the Docker-manager module.

## 2. Controlled test inputs

- [x] 2.1 Pin ENABLE_NETWORK=true, SANDBOX_HOST_BIND_IP=172.31.0.1 and SUBAGENT_CLI=claude for runtime-importing unittest cases; use scoped cleanup so the parent environment survives success and failure.
- [x] 2.2 Pin network mode and bind address in the passthrough test's existing overrides; retain all three explicit CLI cases and every assertion/production guard.
- [x] 2.3 Execute the same two focused modules under default, disabled-network, mismatched-bind and invalid/non-default inherited CLI environments; all 13 tests pass. Run the standalone unittest entrypoint with a caller-owned temporary BASE_DATA_DIR and an environment-restoration smoke.

## 3. Integration and delivery

- [x] 3.1 Run the full project unit commands from `.github/workflows/build.yml`: `pytest tests/orchestrator/ -v`, `pytest tests/test_auth_guard.py -v`, and `python -m unittest discover -s tests/deploy -v`; record actual counts and any failures without weakening or skipping tests.
- [x] 3.2 Complete compact correctness/test-evidence review at the frozen head; publish scoped local CI and central doc/decision evidence.
- [x] 3.3 Merge source and central fixture PRs, close the issue, and archive the fixture.

## Risk packs

Selected: concurrency / shared state — caller-owned environment must be restored and explicit per-CLI values must win over defaults (2.1–2.3); full-suite execution checks cross-module compatibility (3.1).

Not selected: public API / CLI, config / project setup, file IO / path safety, schema, auth / secrets, resource limits, legacy compatibility, error handling / rollback, release / dependency compatibility — no production surface changes; the existing fake and startup/network guards stay active. Documentation / migration notes: no migration, this fixture records the test-only boundary.

No new permanent source-text or mock-echo tests. Existing behavior assertions plus subprocess environment cases are the oracle. Native local unit evidence does not certify deployment or a rebuilt sandbox image.
