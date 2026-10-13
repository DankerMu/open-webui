## Purpose

Keep pull-request exemption decisions fresh when labels change on the same head, while preserving the existing required-check and guard policies.

## ADDED Requirements

### Requirement: Pull-request label changes request fresh CI evaluation

The CI workflow SHALL subscribe to label additions and removals as well as its existing opened, synchronized-head and reopened pull-request activities. Each subscribed label event SHALL evaluate exemptions from the resulting pull-request label list without requiring a new commit or reopen. Existing push selection, concurrency behavior and permissions SHALL remain unchanged.

#### Scenario: Existing pull-request activities remain supported

- **WHEN** a pull request is opened, its head is synchronized, or it is reopened
- **THEN** the workflow retains its existing guard and required-check evaluation behavior

#### Scenario: Diff exemption is added to an oversized pull request

- **WHEN** `diff-limit-exempt` is added to an oversized pull request without changing its head
- **THEN** the label event requests a fresh evaluation and the diff-size enforcement step is skipped
- **AND** the required aggregate succeeds only when all its required jobs succeed

#### Scenario: Diff exemption is removed from the same head

- **WHEN** `diff-limit-exempt` is removed after an exempted evaluation succeeded on an oversized pull request
- **THEN** the removal requests a fresh evaluation, the diff guard fails and the aggregate fails
- **AND** the removed label's name in the event does not preserve the exemption

#### Scenario: Lockfile exemption is added or removed

- **WHEN** `lockfile-refresh` is added or removed on a pull request with a lockfile-only change
- **THEN** each event requests a fresh evaluation using its resulting label list
- **AND** addition skips the lockfile enforcement step while removal restores its existing failure
- **AND** both existing lockfile/manifest pairs retain their policy

### Requirement: Exemption reevaluation cannot weaken required checks

Label-event evaluation SHALL preserve the existing diff threshold and exclusions, lockfile/manifest policy, complete required-job dependency set, aggregate check name and unconditional aggregate evaluation. An exemption SHALL affect only its existing guard step. Other failed or cancelled required jobs SHALL still fail the aggregate, and a skipped required job on a pull-request event SHALL still fail it.

#### Scenario: Another required job fails despite an exemption

- **WHEN** either exemption is present and another required job fails or is cancelled
- **THEN** the aggregate fails rather than accepting the exempted guard's result as sufficient

#### Scenario: A required job is skipped on a label event

- **WHEN** a required job is skipped during label-triggered pull-request evaluation
- **THEN** the aggregate executes and fails
- **AND** skipping an exempted guard step is not misrepresented as skipping its required job

#### Scenario: Existing guard boundaries remain intact

- **WHEN** ordinary pull-request diffs reach the current size boundary, an existing exclusion applies, or a lockfile and its manifest change together
- **THEN** the existing guard decisions remain unchanged

#### Scenario: Push-to-main policy remains intact

- **WHEN** a push event targets main
- **THEN** the existing intentional PR-only job skips and aggregate policy remain unchanged
