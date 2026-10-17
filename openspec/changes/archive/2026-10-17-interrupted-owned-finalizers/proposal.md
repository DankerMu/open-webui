# Proposal

## Why

Issue294 identifies a shared harness cleanup gap: `KeyboardInterrupt` during owned-data cleanup bypasses sentinel verification and scratch removal. The interruption must remain non-success while both later finalizers are attempted.

## Triage

- Issue type: bugfix.
- Fixture level: expanded.
- Upstream suggested level: absent; shared CLI lifecycle and filesystem deletion require expanded coverage.
- Blast radius: smoke-proxy and UI-harness finalization, sentinel observation and run-owned private scratch.
- Selected risk packs: Public API/CLI; File IO; Auth/secrets; Concurrency/ordering; Legacy compatibility; Error handling; Documentation.
- Evidence floor: deterministic semantic RED/GREEN through both real harness classes, actual child-process signals at the owned-data boundary, existing cleanup regressions and scoped gates.

## What Changes

- Guarantee sentinel checking and scratch-removal attempts after owned-data cleanup is interrupted, preserving the interruption after finalization.
- Keep ordinary cleanup `Fail`/`Exception` status handling, process cleanup order and exact ownership boundaries unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-proxy-smoke`: add the shared owned-data interruption finalizer guarantee used by smoke-proxy and the UI harness.

## Impact

Existing `scripts/smoke_proxy_support.py`, its cleanup test module and owning harness decision. No process-termination policy, HTTP cleanup eligibility/aggregation, repeated-signal shielding, UI rendering, OCU source/pin, dependency or deployment change. No claim of data loss or process leakage from the original gap.
