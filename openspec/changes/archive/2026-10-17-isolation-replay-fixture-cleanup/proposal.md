# Proposal

## Why

Issue361 records a successful isolation/replay smoke leaving its owned `ocu-office-fixtures-*.json` file behind. The two stub lifetimes stop independently, but neither owns final fixture removal. This is test-harness cleanup, not a production-file leak.

## What Changes

- Enclose the existing two-stub replay lifecycle in an outer fixture-finalization boundary, preserving both inner stop operations and every protocol assertion.
- Remove only the exact fixture created by this invocation after its acquired stub has stopped, including startup and assertion/replay failures.
- Add a focused real-process/filesystem regression and verify successful smoke plus the existing pagination fault outcomes with private temporary roots.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-stub`: isolation/replay smoke owns its configuration file through success and exceptional completion.

## Impact

`scripts/smoke_stub_office.py::assert_isolation_and_replay`, a focused regression using existing harness conventions, and existing smoke guidance. No change to fixture contents, pagination, production routes, dependencies or already-clean sibling owners.

## Fixture Contract

Level: expanded because cleanup crosses child-process and filesystem ownership; implementation remains one narrow outer finalizer. Governing invariant: every acquired replay stub is stopped before the invocation-owned fixture is removed; no matching-name glob cleanup or caller-file deletion. Existing isolation/replay/pagination assertions remain unchanged.

Selected packs: file IO/path safety, concurrency/shared state, error recovery, CLI/script entry, compatibility/downstream callers and documentation; tasks map each to proof. Auth, schema, dependencies, performance/SLO and deployment changes are not selected: their behavior is unchanged and no new claim is made. Existing issue361 evidence is authoritative; do not rerun the reported success-path leak merely to reconfirm it.
