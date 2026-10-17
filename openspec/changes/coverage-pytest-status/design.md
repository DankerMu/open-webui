# Design

## Context

The backend branch pipes pytest through tail and ignores the subshell status. Coverage is a distinct check; passing measured coverage cannot establish that assertions passed. Make test-backend already treats pytest exit5 as a tolerated no-tests baseline. The frontend coverage branch already propagates Vitest failure.

## Goals / Non-Goals

Governing invariant: standalone coverage-gate succeeds only when each selected test runner has an acceptable status and existing gated coverage reports succeed.

Preserve pytest exit0/5, coverage reporting even after test failure, modified-upstream advisory reports, frontend failure gating, no-scope success and independent Make/CI test steps.

Do not change source discovery, threshold values, aggregate-vs-per-file Python coverage, dependencies, CI jobs, runtime auth or service configuration.

## Decisions

Capture pytest's status at the backend pipeline boundary and propagate it to the existing fail accumulator. Keep output truncation and the subsequent reporting flow. Prefer localized pipeline status handling to global pipefail, which would also change unrelated discovery/head/grep pipelines. Do not use a new temporary output file merely to recover status; no new file-lifetime owner is necessary.

Add a backend-discovered harness regression exercising the actual script/Make boundary in a disposable repository. Control discovery and external command exit statuses; assert both final result and subsequent coverage/frontend execution. Test dependencies may be executable receivers, never a mocked gate. Parent supplements them with real pytest and coverage against a tiny disposable module whose failing assertion still reaches full coverage.

Sibling surfaces: Make test-backend exit5 policy; the frontend branch in coverage-gate; Make check and CI's independent test-before-coverage sequence. They remain unchanged and are audited read-only.

## Verification and Risks

- pytest1 plus passing coverage must fail while still reporting coverage; setup/collection errors must also fail.
- pytest0/5 with passing reports succeed; exit5 with failing coverage still fails.
- backend coverage and frontend Vitest failures remain failures; advisory modified-only report failure stays advisory.
- no scoped files continues to succeed without launching test runners.
- a real pytest assertion failure with100% module coverage must reject; restoring the assertion must accept. All generated inputs/reports stay in parent-owned temporary repositories and are removed.

## Rollback

Revert the focused script/test/docs change. No persisted formats or migrations are involved.
