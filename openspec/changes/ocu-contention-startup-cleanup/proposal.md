# Proposal

## Why

Contention-test startup failures can be replaced by an unstarted watchdog join, or bypass explicit thread-holder cleanup. The owning test must report the startup failure after cleaning up resources it acquired.

## Triage

- Issue type: bugfix (test harness).
- Fixture level: expanded.
- Upstream suggested level: absent; concurrency and acquired-resource ownership require expanded coverage.
- Blast radius: two Office contention tests and their failure diagnostics; no production changes.
- Selected risk packs: concurrency/shared state/ordering; error handling/rollback/partial outputs; documentation/migration notes.
- Evidence floor: semantic RED/GREEN for controlled process-start, first-marker and thread-readiness faults; both real successful contention tests; actual pytest CLI fault probes; scoped lint and central documentation/spec gates.

## What Changes

- Establish cleanup ownership before fallible holder startup/readiness.
- Join the watchdog only if it started; release and observe acquired holders and restore patches on exceptional exit.
- Add regressions that distinguish the initiating failure from an exception merely retained in another error's context.

## Capabilities

### New Capabilities

- `ocu-contention-test-lifetime`: startup-failure diagnostics and holder ownership in Office contention tests. The existing HTTP-origin lifetime capability owns servers, not these lock holders.

### Modified Capabilities

None.

## Impact

OCU `tests/orchestrator/test_office_control_plane_concurrency.py`, focused regression tests and test documentation; central OpenSpec, evidence and testing decision. No dependency, production, timeout-policy or public API changes. Source authority: [issue 257](https://github.com/DankerMu/open-webui/issues/257).
