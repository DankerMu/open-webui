# Proposal

## Why

Issue #401 reports that the CI diff-size guard omits complete-file deletions through its ACMR filter despite the400line policy. Its historical deletion observation is accepted evidence, not rerun. A synthetic disposable Git counterexample will provide the new regression baseline.

## What Changes

Include statusD in the existing workflow guard's filter. Preserve counting syntax, whitespace handling, triple-dot base comparison, threshold, exclusions and label policy. Add a Vitest-discovered executable workflow-step regression and refresh the stale deletion-boundary note in the existing CI exemption decision.

## Capabilities

### New Capabilities

- `ci-diff-size`: the PR size guard includes whole-file deletions in its existing countable-line policy.

### Modified Capabilities

None; `ci-exemption-label-events` stays unchanged.

## Impact

CI file `.github/workflows/ci.yml` changes and will be explicitly flagged in the PR. New script test/focused Make target use existing Node/Vitest/YAML dependencies. No production module extraction, dependency update,400line policy change or #262 label-trigger work.

## Risk triage

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded for shared CI gate/public execution policy.
Blast radius: deletion-only/mixed PRs bypass the size limit or valid/exempted changes are rejected.
Selected risk packs: script/CI entry, legacy compatibility, error handling, documentation.
Evidence floor: actual extracted workflow Bash on real disposable Git diffs, semantic RED/GREEN at400/401, mixed/modified deletion/exclusions/whitespace, bounded exemption replay, scoped checks and expanded review.
