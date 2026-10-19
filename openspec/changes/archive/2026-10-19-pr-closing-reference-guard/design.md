## Context

The approved home is tracked central WebUI code, not `.omp` or GitHub Actions. Existing Makefile commands delegate to scripts; Python script tests already live under `scripts/`. No maintained closing-reference implementation or spec was found.

## Goals / Non-Goals

- Invariant: guarded merge is invoked only for an open PR at the supplied reviewed head, after explicit intended closures equal the complete GitHub-resolved set.
- Preserve branch protection, the local-CI choice and operator review authority. Do not parse negation, alter PR wording, close/reopen issues, bypass protection, upgrade dependencies or modify application behavior.
- A direct GitHub UI/API merge outside the provided command is not intercepted; this is the canonical contributor merge path, not a new repository ruleset.

## Decisions

- One `scripts/pr-merge.py` owns reading, comparison and optional merge; `make pr-merge-check`, `make pr-merge` and `make test-pr-merge-guard` remain thin entrypoints. OCU callers use `make -C <central-checkout>` with their own target repository.
- Inputs are explicit repository, positive PR number and full reviewed head SHA. Makefile exports inputs rather than interpolating their values into shell source. No arbitrary command passthrough, admin, auto-merge or force flags.
- PR body contains exactly one `<!-- intended-closing-issues: JSON -->` marker. JSON is an array of fully qualified `owner/repo#number` strings; `[]` is explicit no closure. Normalize repository case for identity; reject malformed or duplicate intended identities and duplicate markers. Missing metadata has no inferred default.
- Fetch GitHub GraphQL `closingIssuesReferences` with pagination, not a first-page-only CLI summary. Bind repository/PR identity, state, head and body across pages; refuse malformed/partial/error/null results, non-progressing pagination and a bounded traversal that cannot establish completion. Compare complete sets independent of order.
- Check-only prints normalized expected/actual sets and fails on extra or missing references. Guarded mode performs the same fresh check then invokes `gh pr merge --merge --match-head-commit <reviewed-head>` for the exact PR. A failed check never invokes merge; a failed merge stays failed and is not retried.
- Metadata and merge are separate GitHub operations: there is no atomic body/reference compare-and-merge API. Head binding prevents source drift; concurrent PR-body edits by other actors remain outside this local guard's atomicity guarantee. Do not claim a server-side lock.
- The PR template distributes the marker and commands; a process decision owns usage, OCU invocation, metadata semantics and limitations. Existing PRs must add explicit metadata before using the command.

## Seams and Evidence

- Paired `scripts/test_pr_merge.py` exercises the actual CLI with deterministic external `gh` responses and invocation logs. Assertions concern decisions, reported sets, complete discovery, and absence of mutations on mismatch/errors, not source text or forwarding echoes.
- Test empty equality, nonempty equality, case/order normalization, extra/missing/cross-repo collisions and the historical negated prose with nonempty resolved references. Test pagination, missing/duplicate markers, malformed metadata, non-open PRs, unavailable/partial API, stale head and merge failure propagation.
- Run `make test-pr-merge-guard` and relevant static/docs checks. Live `make pr-merge-check` against this issue's own PR proves API acquisition and metadata parsing; final guarded merge proves the distributed entrypoint without a sacrificial issue closure.
- Capture semantic rejection before acceptance using the actual check and mismatching fixture; retain test-first failures honestly. No production credentials or private response body in evidence.

## Risks / Rollback

A missing intended marker blocks rather than guessing. API failure cannot turn into an empty set. Reverting the command restores only the previous manual comparison obligation, not permission to skip it. Sibling surfaces are template intent, GraphQL pagination, both CLI modes, Makefile dispatch and OCU cross-repository use; all share one comparison.
