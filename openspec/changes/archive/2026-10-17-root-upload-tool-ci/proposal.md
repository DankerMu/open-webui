# Proposal

## Why

Issue339 identifies a main-branch CI coverage omission: upload-publication and tool-consumer root modules are not selected by the non-image pytest job. Their complete existing tests must run automatically without broadening this change to the full root suite.

## Triage

- Issue type: test/CI configuration.
- Fixture level: expanded; upstream level absent.
- Reason: shared workflow execution and failure-propagation contract.
- Blast radius: future upload/attachment regressions pass CI unnoticed, or a new command silently masks failures.
- Selected risk packs: script entry, CI configuration, failure propagation, compatibility, dependency compatibility, documentation.
- Evidence floor: baseline versus candidate selected-node inventory, actual complete-module execution and per-module failure controls, unchanged trigger/integration contracts, scoped document checks and hooks.

## What Changes

- Add a separate pytest invocation for both complete root modules to the existing non-image job in main's build workflow.
- Keep existing orchestrator/auth/deploy and integration commands, main push/PR triggers, dependencies and test semantics unchanged.
- Record actual local execution of the workflow command and its failure behavior; do not substitute collection for execution.

## Capabilities

### Modified Capabilities

- `ocu-pytest-discovery`: main CI covers complete root upload/tool modules separately from orchestrator collection.

## Impact

OCU `.github/workflows/build.yml` and existing testing documentation/changelog; WebUI fixture/evidence. CI-file modification must be flagged in PR. No production/test edits, full-root activation, next/v1 workflow change, or new dependency on issue199 acceptance.
