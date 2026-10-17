---
id: 2026-10-17-python-per-file-coverage
title: Enforce added Python coverage independently per file
kind: testing
status: implemented
date: 2026-10-17
supersedes: none
references: issue-410, 2026-10-17-coverage-gate-test-status
---

# Enforce added Python coverage independently per file

## Problem

A Coverage.py report with multiple included files applies `--fail-under` to their combined total. Equal-sized files at 60% and 100% therefore pass an 80% aggregate check despite the per-file policy in `constraints.yaml`.

## Decision

`scripts/coverage-gate.sh` runs the existing Coverage.py threshold report independently for every selected fork-added Python path, using the configured minimum. Coverage.py owns threshold, precision and missing-data semantics; a file exactly at the minimum passes.

Iteration consumes newline-delimited selected paths in the owning shell, preserving path data and the failure accumulator. A below-floor result or report error sets failure without stopping remaining files, modified-upstream advisory reports or frontend tests. The diagnostic identifies the failed path.

Source selection, configured thresholds, modified-upstream advisory policy and frontend per-file enforcement remain unchanged. Pytest runs once, with exit 0/5 tolerance and independent failure propagation governed by the [backend-test status decision](2026-10-17-coverage-gate-test-status.md). That decision remains valid and is not superseded.

`make test-coverage-gate` exercises the actual Make/script boundary with external receivers deriving report results from requested file coverage. Regressions cover aggregate masking in either selection order, the exact threshold, and continued evaluation after below-floor results or report errors.

## Alternatives considered

- **One aggregate include report** — allows a higher-coverage file to offset another file's deficit, violating the per-file policy.
- **Structured JSON report and dedicated parser** — adds report parsing and a second threshold evaluator instead of reusing Coverage.py's threshold, precision and missing-data behavior.
- **Piped-loop iteration** — can isolate failure accumulation in a subshell, allowing a failed report to be lost from the final verdict.

## Consequences

One coverage-report process per selected added Python file is the accepted cost; pytest is not repeated. A measured process-cost problem can justify revisiting structured reporting. No production temporary report or global shell-option change is needed, and a later successful report cannot clear an earlier failure.
