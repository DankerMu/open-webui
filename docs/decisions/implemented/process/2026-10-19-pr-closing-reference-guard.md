---
id: 2026-10-19-pr-closing-reference-guard
title: Explicit intended issue closures gate the maintained merge command
kind: process
status: implemented
date: 2026-10-19
supersedes: none
references: '#389; openspec/changes/archive/2026-10-19-pr-closing-reference-guard; openspec/specs/pr-closing-reference-guard/spec.md'
---

# Explicit intended issue closures gate the maintained merge command

## Problem

GitHub-resolved closing references can differ from an author's stated intent, including when prose denies closing an issue. An unintended closure must block the contributor merge command, not trigger an issue-state repair after merge. The guard must be distributed in tracked central code and usable for both WebUI and OCU PRs.

## Decision

[`scripts/pr-merge.py`](../../../../scripts/pr-merge.py) is the canonical guard. The PR body declares exactly one metadata comment containing a JSON array:

```html
<!-- intended-closing-issues: ["DankerMu/open-webui#123", "DankerMu/open-computer-use#456"] -->
```

Use `[]` explicitly when no issue should close. Each entry is a full `owner/repo#positive-number` identity; repository case and array order do not affect equality. Missing or malformed metadata, repeated markers, and duplicate intended identities are refusals. Existing PRs must add the marker before using the command. The [PR template](../../../../.github/pull_request_template.md) distributes this declaration.

The command uses the operator's existing authenticated `gh` CLI; it does not load credentials itself. Supply the exact repository, positive PR number and full reviewed 40-character commit SHA:

```sh
make pr-merge-check PR_REPO=DankerMu/open-webui PR_NUMBER=123 PR_HEAD=0123456789abcdef0123456789abcdef01234567
make pr-merge PR_REPO=DankerMu/open-webui PR_NUMBER=123 PR_HEAD=0123456789abcdef0123456789abcdef01234567
```

`pr-merge-check` is read-only. `pr-merge` acquires a fresh snapshot and repeats the complete check before invoking `gh pr merge --merge --match-head-commit` for the explicit target. The reviewed SHA is an operator-supplied review boundary, not a claim that this command performs review. Normal branch protection remains authoritative; merge failures propagate without retries, auto-merge or administrator bypasses. If the merge command cannot be launched or times out, the outcome is reported as unknown; inspect the PR state before retrying.

OCU PRs use this central checkout, not a copied script:

```sh
make -C /path/to/open-webui pr-merge-check PR_REPO=DankerMu/open-computer-use PR_NUMBER=456 PR_HEAD=0123456789abcdef0123456789abcdef01234567
make -C /path/to/open-webui pr-merge PR_REPO=DankerMu/open-computer-use PR_NUMBER=456 PR_HEAD=0123456789abcdef0123456789abcdef01234567
```

The GraphQL acquisition binds the target identity, open state, reviewed head and body across all `closingIssuesReferences` pages. API errors, null or partial data, snapshot drift, repeated/invalid cursors and overlapping references refuse. Discovery is bounded to 100 pages of at most 100 references, with a 30-second timeout per `gh` operation; failure to establish completion within those bounds refuses rather than comparing a partial set. Successful acquisition reports normalized expected, actual, extra and missing sets. Equality alone permits merge; prose negation has no special meaning. Refusal never merges, edits the PR, or closes/reopens issues.

## Alternatives considered

- **Parse negated closing prose** — author wording cannot reliably predict GitHub's resolved relationships; explicit intent versus the complete API-resolved set is the decision boundary.
- **A first-page CLI summary** — a partial result can hide an extra closing reference; complete paginated discovery must precede comparison.
- **A hosted workflow or server-side ruleset** — outside the owner-selected local merge-command scope; this decision does not change GitHub Actions or repository protection.
- **A machine-local skill or copied OCU guard** — neither supplies one tracked, reusable implementation; OCU invokes central Makefile targets.
- **Automatically reopen an unintended issue** — repairs happen after the unsafe merge and can overwrite unrelated issue state; the command refuses without corrective mutations.

## Consequences

The guard enforces only invocations through the maintained command. Direct GitHub UI/API merges are not intercepted. Metadata acquisition and merge are separate remote operations: there is no atomic body/reference compare-and-merge or server-side metadata lock. Head matching prevents source drift at merge, but concurrent body/reference edits after acquisition remain outside that guarantee. Operators must avoid concurrent metadata edits during merge.

The oracle is GitHub `closingIssuesReferences`, which includes keyword-referenced and manually linked issues. Closing keywords in commit messages or the merge-commit title may close issues on the default branch independently; this guard does not inspect them and adds no text heuristic. Keep commit messages and merge-commit titles free of closing keywords.

No dependency, application runtime, workflow or permission change is required. [`scripts/test_pr_merge.py`](../../../../scripts/test_pr_merge.py), run with `make test-pr-merge-guard`, exercises the public CLI against an external synthetic `gh` boundary, including refusal without mutations and head-bound merge outcomes. Reverting the command removes this local gate; it does not establish closure-set safety for manual merges.
