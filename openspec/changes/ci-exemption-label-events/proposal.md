# Proposal

## Why

The CI workflow's implicit pull-request activity selection ignores label additions and removals. Exemption decisions then retain an earlier event's label snapshot until a push or reopen, affecting both the diff-size and lockfile guards (issue262).

## Risk classification

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; shared CI entrypoint and required-check configuration trigger expanded treatment.
Blast radius: stale exemption decisions or an accidentally weakened required aggregate.
Selected risk packs: script entry, configuration, ordering, resource limits, compatibility, error handling, CI release checks and documentation.
Evidence floor: documented event semantics, baseline/candidate same-head event replay with real guard/aggregate shell execution, qualified negative controls, unchanged job/policy/configuration identities, and independent review.

## What Changes

- Subscribe to `labeled` and `unlabeled` alongside `opened`, `synchronize` and `reopened` in the existing workflow.
- Reuse the resulting pull-request label list and both existing exemption conditions without API calls or new permissions.
- Preserve every required aggregate dependency, guard program, threshold, exclusion, push trigger and concurrency setting.
- Document the all-label-event rerun cost and the boundary between local replay and hosted Actions admission.

## Capabilities

### New Capabilities

- `ci-exemption-label-events`: fresh CI exemption evaluation on same-head pull-request label changes, without weakening required checks.

### Modified Capabilities

None. The existing `source-format-boundary` capability concerns generated review-state exclusion, not event-driven exemption evaluation.

## Impact

Production change: `.github/workflows/ci.yml` event subscription only, with a motivating configuration comment. Parent-owned temporary verification executes the existing workflow programs rather than introducing another production guard or permanent source-wiring test. Documentation records the CI change; no application, dependency, threshold, permission or exemption-policy change.
