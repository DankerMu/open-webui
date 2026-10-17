---
id: 2026-10-17-coverage-gate-test-status
title: Standalone coverage gate preserves backend test status
kind: testing
status: implemented
date: 2026-10-17
supersedes: none
references: issue-385
---

# Standalone coverage gate preserves backend test status

## Problem

Measured coverage proves that lines execute, not that assertions pass. Standalone `make coverage-gate` must reject failed backend tests even with sufficient coverage, without relying on the independent Make and CI test steps.

## Decision

Repository maintainers own this policy; `scripts/coverage-gate.sh` owns the gate's exit semantics. The backend subshell exits with `PIPESTATUS[0]` immediately after the pytest/tail pipeline, before another command can overwrite that status. A failed backend directory change also remains nonzero.

Pytest exit0 and exit5 (no tests collected) are acceptable, matching `test-backend`. Other nonzero statuses set the existing failure accumulator and produce a backend-test diagnostic distinct from coverage failures. Exit5 does not excuse a gated coverage-report failure.

Gated coverage reports, modified-upstream advisory reports, and frontend tests continue after backend test failure. Advisory report failures remain advisory; gated coverage and frontend test failures remain fatal. Independent `test-backend`, `check`, and CI test steps, coverage thresholds, and source-discovery rules remain unchanged.

`make test-coverage-gate` exercises the actual Make/script boundary in disposable Git repositories. Executable receivers control external tool statuses without replacing the gate or importing the application.

## Alternatives considered

- **Global `set -o pipefail`** — changes unrelated discovery, `head`, and `grep` pipeline semantics rather than preserving status only at the pytest boundary.
- **Temporary pytest-output file** — requires an additional file-lifetime owner solely to recover a status that Bash already exposes.
- **Rely on separate Make/CI tests** — leaves standalone coverage success unable to establish acceptable test-run status.

## Consequences

The pipeline's status capture must remain adjacent to the pipeline. No production temporary output file or global shell-option change is needed. The no-tests tolerance does not guarantee that tests exist, and modified-upstream coverage remains advisory under the existing baseline policy.
