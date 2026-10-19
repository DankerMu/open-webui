## Why

GitHub can resolve issue-closing references from prose that intended the opposite outcome. Issue #389 records an unintended closure; the owner selected a tracked central script and metadata, distributed with this repository, instead of relying on a machine-local skill or a manual API comparison.

## What Changes

- Require explicit PR-body metadata for the intended repository-qualified issue set, including `[]`.
- Add one central script with a check-only mode and a guarded merge mode; both compare the complete GitHub-resolved set exactly and bind the reviewed PR head.
- Add thin Makefile commands, behavior tests, PR-template guidance and one process decision. OCU paired PRs invoke this same central implementation.
- Refuse missing/extra references or unverifiable API/metadata state without attempting merge or changing issues.

## Capabilities

### New Capabilities

- `pr-closing-reference-guard`: explicit closure intent and resolved-reference equality before guarded merge. No existing spec owns this workflow boundary.

### Modified Capabilities

None.

## Impact

`scripts/`, `Makefile`, `.github/pull_request_template.md`, and a process decision. No application source, dependencies, hosted workflow or AGENTS policy changes. Existing branch protection remains authoritative.

## Triage

- Issue type: bugfix.
- Fixture level: expanded; shared CLI, metadata schema and merge state transition.
- Upstream suggested level: expanded in the accepted proposal; agree.
- Blast radius: an unintended issue closure or a merge blocked by incomplete evidence.
- Selected packs: CLI, configuration/distribution, schema, ordering, bounded discovery, compatibility, error handling, documentation.
- Evidence floor: empty/exact/extra/missing/cross-repository cases, complete pagination and fail-closed errors through the actual CLI; no merge invocation on refusal; live check against this PR and use the guarded path for its merge.
