# Proposal

## Why

The OCU environment-injection test doubles retain the `created` state after start and omit inspected DNS settings. Eight tests fail before reaching their credential-isolation assertions, including on the untouched integration branch.

## What Changes

- Repair the two existing Docker test fixtures to model successful create/start/reload and controlled DNS configuration.
- Preserve all production lifecycle and DNS checks, and every environment-injection assertion.
- Keep this prerequisite separate from the upload implementation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-lifecycle`: require credential-isolation verification to reach its assertions through the real startup guards with controlled DNS inputs.

## Impact

OCU test files `tests/orchestrator/test_docker_manager.py` and `tests/orchestrator/test_passthrough_isolation.py`; existing changelog only for documentation. No production, dependency, API, or deployment changes.

## Triage

- Issue type: test; source issue: DankerMu/open-webui#184.
- Fixture level: compact; upstream suggested level absent. Test-fixture correction only; no runtime behavior or authorization policy changes.
- Blast radius: reliability of credential-injection and runtime-isolation evidence.
- Selected risk packs: config/project setup, auth/permissions/secrets, error handling, documentation.
- Evidence floor: both test modules pass with DNS absent and valid DNS configured; complete OCU unit command passes without skips added or guards mocked away.
- Must preserve: credential allowlists, internal-token exclusion, CLI isolation, lifecycle state verification, DNS compatibility enforcement.
- `design.md` omitted at compact level; fixture changes remain within the two existing test modules.
