---
id: 2026-10-13-ci-exemption-label-events
title: Reevaluate CI exemptions on pull-request label changes
kind: bug-fix
status: implemented
date: 2026-10-13
supersedes: none
references: 'https://github.com/DankerMu/open-webui/issues/262; openspec/changes/archive/2026-10-12-ci-exemption-label-events; docs/evidence/issue-262/verification.json'
---

# Reevaluate CI exemptions on pull-request label changes

## Problem

Exemption decisions use the labels captured by the triggering event. Without label-event subscriptions, adding or removing an exemption at an unchanged head leaves its guard result stale until a push or reopen. Both `diff-limit-exempt` and `lockfile-refresh` need fresh evaluation.

Source: [exemption-label issue](https://github.com/DankerMu/open-webui/issues/262) and [approved fixture](../../../../openspec/changes/archive/2026-10-12-ci-exemption-label-events/proposal.md).

## Decision

The [CI workflow](../../../../.github/workflows/ci.yml) explicitly subscribes to `opened`, `synchronize`, `reopened`, `labeled` and `unlabeled`. The three default activities remain supported; label additions and removals request reevaluation without a new commit.

Both exemption conditions use the resulting `github.event.pull_request.labels` list. A removal event's `event.label` names the removed label and is not the exemption authority. An exemption skips only its existing enforcement step, not its required job or the aggregate. Every required dependency remains mandatory; failed or cancelled jobs, and skipped required jobs on pull-request events, still fail the aggregate.

The push-to-main trigger, permissions, concurrency, guard programs, 400-line threshold, exclusions, lockfile/manifest pairs and exemption justification policy remain unchanged.

## Alternatives considered

- **Read live labels through the GitHub API** — adds permissions and API plumbing when event snapshots already provide the resulting label list.
- **Filter label events at job level** — introduces skipped-job and aggregate-policy changes instead of fixing only the subscription.
- **Require a push or reopen after label edits** — retains the stale-decision failure at the same head.

## Consequences

Every label addition or removal requests the whole workflow, including unrelated labels. Extra runs and cancellation of same-ref work are accepted costs; the existing concurrency policy remains authoritative. Event snapshots do not promise synchronous live-label reads or hosted Actions availability.

[Canonical verification evidence](../../../evidence/issue-262/verification.json) records 45 local replay rows executing the actual guard and aggregate shell programs. This evidence does not certify hosted Actions event delivery or execution of unrelated CI jobs; those job results are controlled replay inputs. Acceptance uses the owner-approved scoped local-CI policy.

The separate [whole-file deletion filter issue](https://github.com/DankerMu/open-webui/issues/401) remains unchanged: the guard's `ACMR` filter omits complete-file deletions. This known counter defect is outside label-event acceptance, not a regression introduced by the subscription change.
