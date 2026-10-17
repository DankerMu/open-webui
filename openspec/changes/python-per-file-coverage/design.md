# Design

## Context

constraints.yaml declares80% per file for fork-added code. The Python branch joins selected paths into one Coverage.py include list; its threshold applies to the total. Test-run failure status is already enforced independently. Coverage.py7.16.1 is installed and remains pinned.

## Goals / Non-Goals

Governing invariant: every selected added Python file must individually meet the configured floor for coverage acceptance; no other file can offset its deficit.

Preserve source selection, configured minimum, pytest0/5 policy, failure accumulation, reports after failure, upstream advisory and frontend per-file behavior. Do not change #295, dependencies, CI, test discovery or the existing status requirement.

## Decisions

Run the existing Coverage.py threshold report once per selected added Python path, feeding each result into the existing failure accumulator. Keep iteration in the owning shell so a loop subshell cannot lose failure state. Continue through all paths and then advisory/frontend branches. Use the selected newline-delimited paths as data rather than reselecting files.

Prefer the issue's narrow per-file-report recommendation to a new JSON parser: it reuses Coverage.py's threshold, precision and missing-data behavior without a second evaluator or temporary-file owner. Cost is one report process per selected added Python file; pytest still runs once. A future measured cost problem can justify a separate parser, not this correctness cutover.

Extend the existing disposable Make/script test harness rather than add another implementation. Its report receiver must calculate the requested include-set result from controlled file coverage data, accepting aggregate and per-file request shapes; otherwise RED could be a fixture-wiring failure. Permanent assertions target verdicts and continued evaluation, not literal command counts or diagnostic wording.

Sibling surfaces: the #385 status matrix, modified-upstream advisory report, frontend perFile flag, Make/CI callers and constraints.yaml policy. No changes to those contracts.

## Verification and Risks

- Two equal-sized files at60% and100% yield80% aggregate: baseline accepts, per-file gate must reject regardless of selection order.
- Files at exactly80% and100% pass; higher-coverage neighbors cannot mask a later lower file.
- A per-file reporting error remains fatal and does not stop remaining reports/advisory/frontend work.
- Existing12status cases stay green, including pytest failures and exit5, coverage errors, no-scope and advisory behavior.
- Parent real Make/pytest/Coverage.py run measures the file percentages independently, records gate exit, and removes only its disposable repository.

## Rollback

Revert the focused enforcement change. No persisted data or report format migration is introduced.
