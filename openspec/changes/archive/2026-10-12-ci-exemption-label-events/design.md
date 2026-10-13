# Design

## Context

See proposal.md for the stale-label failure. The existing workflow has two PR-only guard jobs, label-based step exemptions, a seven-job required aggregate, and same-ref cancellation. GitHub's documented implicit PR activities are `opened`, `synchronize` and `reopened`; explicit `types` replaces that default selection.

## Goals / Non-Goals

**Governing invariant:** a same-head label addition/removal requests a fresh evaluation from its resulting PR label list, without allowing an exemption to bypass another required job.
**Must preserve:** all three default PR activities; push-to-main behavior; both exemption names and justification policy; 400-line threshold and exclusions; guard programs; all seven aggregate dependencies and failure/cancellation/skipped rules; permissions, jobs and concurrency settings.
**Non-goals:** repairing hosted Actions admission, changing repository settings, API-based label reads, new permissions, label-specific job filtering, changing unrelated checks or certifying a hosted run from a local replay.

## Decisions

1. Set the existing PR activity list to the three defaults plus `labeled` and `unlabeled`. Add a short comment naming stale exemption results as the motivating failure mode. Do not create another workflow or guard implementation.
2. Keep both existing conditions on `github.event.pull_request.labels.*.name`. A removal payload still names the removed label in `event.label`; that is not the resulting exemption state.
3. Rerun the existing workflow for any label event. Filtering only selected labels at job level would introduce skipped-job/aggregate policy changes; extra runs are the accepted cost of the narrow configuration fix.
4. Keep the aggregate's `always()` and complete dependency set. An exempted guard step produces a successful guard job after its other steps succeed, not an exempted or skipped aggregate dependency.
5. Use parent-owned temporary verification, not a permanent test that pins YAML text or a second CI interpreter in the repository. Parse the actual workflow with the existing YAML toolchain, apply the documented subscription/used-expression semantics, and execute the actual extracted guard and aggregate shell programs.

## Required evidence

- Freeze the baseline workflow, constraints and required-job identities. Establish known-good default-activity cases and semantic RED for label-triggered reevaluation before candidate edits.
- Use isolated standalone Git fixtures, not worktrees. Actual diffs cover 400/401 lines, existing exclusions, each lockfile-only change and valid lockfile/manifest pairs. Execute the workflow programs with explicit allowlisted environments and real base/head revisions.
- Replay addition/removal sequences at the same head. Record subscription decisions, resulting labels, guard execution/skip, exit/output and aggregate outcome. Removing a label must not exempt because `event.label` still names it.
- Inject required-job success/failure/cancelled/skipped results as dependency inputs; run the real aggregate program. Preserve default PR and push behavior. Qualify missing-label-event and weakened-aggregate disposable controls, then restore the accepted candidate.
- The subscription/expression adapter is a bounded platform-contract model, not GitHub's hosted dispatcher. Unrelated job results are controlled inputs, not executed full-CI claims. Report this boundary and retain the owner-approved scoped local-CI policy; use fresh hosted observations only if they actually become available.

## Risks / Trade-offs

All label edits can rerun and cancel same-ref work; preserve the existing concurrency policy rather than adding a second ordering mechanism. Event snapshots are not a promise of synchronous live-label reads or host availability. The parent controls the oracle and acceptance execution; this is role-separated evidence, not an OS-enforced verifier enclave.

## Migration and rollback

One workflow edit, then unchanged-oracle replay, documentation/evidence, independent review and exact-head merge gates. Flag the CI-file change in the PR. Revert the subscription edit to roll back; no schema, dependency or persisted-data migration.
