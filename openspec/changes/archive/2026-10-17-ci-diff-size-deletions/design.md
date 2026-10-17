# Design

## Context

The layer6 workflow step owns the counter and receives BASE_SHA from the pull-request event. Its step condition uses the resulting label snapshot. The #262 evidence archive already contains a bounded YAML/expression replay that executes actual guard programs; its labels policy is not being redesigned.

## Goals / Non-Goals

Invariant: every countable changed line from a non-excluded complete-file deletion participates in the same threshold decision as additions and in-file deletions.

Preserve400threshold, current path exclusions, ignore-all-space, hunk-line regex, BASE_SHA triple-dot comparison, diff-limit-exempt condition, workflow subscriptions/jobs/aggregate and lockfile guard. This is not a general counter rewrite or hosted Actions availability fix.

## Decisions

Make the minimal filter correction ACMR to ACDMR in the existing workflow. Do not extract a second shell implementation or broaden change-scope/check-fast filters: those select extant files for other checks and are different contracts.

Add `scripts/ci-diff-size.test.js` using existing Vitest and YAML1.2 packages, plus `make test-diff-size-guard`. Load the actual workflow run block and execute it with Bash's Actions-style errexit/pipefail settings against disposable Git commits. Test the unexempted shell boundary directly rather than matching source text or copying counter logic. Temporary repositories have private HOME/config and are removed after tests; no user checkout or historical commit is reset.

Parent acceptance reuses the used-expression helper definitions from the immutable #262 replay archive, binding their hash, to evaluate current guard job/step conditions and BASE_SHA environment. It runs the actual extracted guard on deletion/mixed/excluded fixtures with absent/present/removed exemption labels. This is a bounded local expression model, not hosted Actions dispatch or a full runner. Verify workflow semantics outside the one approved filter edit and current constraints are unchanged.

## Verification and Risks

- Unexempted deletion400 passes; deletion401 fails with observed count401.
- Mixed whole-file deletion and addition totals401 and fails; in-file deletion remains counted.
- Excluded lockfiles/snapshots/i18n do not add to a boundary400 included deletion; whitespace-only edits remain ignored.
- Exemption present skips the existing step; absent or removed executes and rejects oversized deletion. Unrelated label does not exempt.
- Parent preserves a semantic baseline and fixed result from real Git/Bash; no network, real repository deletion or application runtime required.

## Documentation / Rollback

This localized filter correction needs no new architectural decision. Update the existing implemented CI exemption record's stale known-defect paragraph without changing its label decision or frozen evidence. Revert the focused filter/test/doc change to roll back.
