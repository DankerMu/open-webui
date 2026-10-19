# pr-closing-reference-guard Specification

## Purpose

Block the maintained merge command unless a PR's explicit intended closing-issue set exactly equals the complete GitHub-resolved closing-reference set at the reviewed head, without inferring intent from prose or changing issue state.

## Requirements

### Requirement: Closure intent is explicit and repository qualified

Every PR using the maintained merge command SHALL declare exactly one intended-closing-issues metadata marker containing a JSON array of repository-qualified issue identities. An empty array SHALL explicitly mean no intended closures. Missing, malformed, ambiguous or duplicate intended identities SHALL refuse rather than infer intent from prose. Repository case SHALL NOT create distinct issue identities; different repositories with the same issue number SHALL remain distinct.

#### Scenario: Explicit empty closure set

- **WHEN** the PR declares `[]` and GitHub resolves no closing references
- **THEN** the closure-set check succeeds
- **AND** a PR without the declaration does not obtain that empty-set result by default

#### Scenario: Nonempty cross-repository intent

- **WHEN** the intended and resolved identities name the same complete issue set across repositories in different order or repository case
- **THEN** the sets compare equal
- **AND** an equal number in another repository is not treated as the same issue

### Requirement: Complete resolved references gate merge

The maintained command SHALL compare explicit intended closures with the complete GitHub-resolved closing-reference set for the target PR at the supplied reviewed head. Extra or missing identities, incomplete or unverifiable discovery, API errors, changed PR identity/body/head during pagination, or a non-open PR SHALL fail closed and report the reason. A set mismatch SHALL report expected and actual identities without a text-negation heuristic.

#### Scenario: Negated wording resolves an unintended closure

- **WHEN** prose says an issue remains open but GitHub resolves it as a closing reference outside the declared intended set
- **THEN** the check refuses and reports the extra identity
- **AND** no merge, issue closure, reopening or PR edit is attempted

#### Scenario: Intended closure is missing

- **WHEN** the intended set contains an identity absent from GitHub's resolved set
- **THEN** the check refuses and reports expected and actual sets
- **AND** no merge or issue-state correction is attempted

#### Scenario: Closing references span pages

- **WHEN** GitHub returns multiple reference pages
- **THEN** equality is evaluated only after all pages for the same PR snapshot are acquired
- **AND** truncated, erroneous or non-progressing discovery cannot become a successful empty or partial comparison

#### Scenario: Reviewed source or acquisition is invalid

- **WHEN** the supplied reviewed head differs from the PR head, or metadata/API acquisition cannot establish the required state
- **THEN** the command exits unsuccessfully without invoking merge

### Requirement: One distributed guard owns the contributor merge path

The tracked central repository SHALL distribute one implementation, metadata guidance and thin check-only and guarded-merge commands. Paired OCU PRs SHALL use that implementation with explicit target repository/PR/head rather than copying it. Guarded merge SHALL perform a fresh successful closure check before invoking a normal head-bound merge; merge failures SHALL propagate without retries or bypass options. The command SHALL NOT close or reopen issues to repair a mismatch. Documentation SHALL distinguish the local command boundary from unguarded UI/API merges and the absence of atomic metadata compare-and-merge.

#### Scenario: Guarded successful merge

- **WHEN** complete intended/resolved sets match for the open PR at the reviewed head and the operator invokes guarded merge
- **THEN** the normal merge operation targets exactly that PR and reviewed head
- **AND** existing branch protection still determines whether GitHub accepts the merge

#### Scenario: Check-only invocation

- **WHEN** the operator invokes check-only mode, including for an OCU PR
- **THEN** the command reports equality or refusal without performing any mutation

#### Scenario: Merge itself fails

- **WHEN** GitHub refuses the subsequent merge despite a successful closure check
- **THEN** the command reports failure and does not retry, bypass protection or change issue states
