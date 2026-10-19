## Summary

<!-- Intent + approach in 2–4 sentences. Link the decision record if the change is non-trivial (docs/decisions/). -->

## Intended issue closures

<!-- intended-closing-issues: [] -->

<!-- Keep exactly one marker. Its JSON array lists full owner/repo#number identities;
     [] explicitly means no issue closures. Include every issue GitHub should close. -->

Before merging, run `make pr-merge-check PR_REPO=owner/repo PR_NUMBER=123 PR_HEAD=<full-reviewed-sha>`.
Merge with `make pr-merge` using the same explicit inputs; it repeats the check.
For OCU PRs, invoke these targets with `make -C <central-checkout>` rather than copying the guard.
See the [merge process decision](../docs/decisions/implemented/process/2026-10-19-pr-closing-reference-guard.md)
for metadata rules and the local, non-atomic enforcement boundary.

## Type of change

- [ ] feat
- [ ] fix
- [ ] refactor
- [ ] chore / docs / test / ci / build / perf

## Test plan

<!-- Commands actually run, per AGENTS.md § Scoped verification. Report pending as pending. -->

## Runtime evidence

<!-- Required. `make smoke` / `make verify-ui` output, screenshots under .run/ui-evidence/.
     "None — review-only change" is allowed only with a stated reason. -->

## Risk

<!-- What could break, blast radius, rollback. -->

## Canonicality check

- [ ] No `_v2`/`_new`/`_old` files, no duplicated logic, no dead exports, no scratch dirs
- [ ] Diff ≤ 400 lines excluding lockfiles/snapshots, or justified here (review-only until the fork has CI)
- [ ] Upstream files touched with minimal diff; new code lives in new modules
- [ ] Docs changed with code (AGENTS.md / docs/plans / decision record)

## References

<!-- Issues, plans (docs/plans/), postmortems. -->
