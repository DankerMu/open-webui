# Proposal

## Why

Missing-root save-as recovery can discard its journal while retaining owned private content and replacing an already-durable timeout outcome. Issue [276](https://github.com/DankerMu/open-webui/issues/276) and its [approved policy](https://github.com/DankerMu/open-webui/issues/276#issuecomment-6095294153) require safe private retirement before completion, without broader orphan collection.

## Risk triage

- Issue type: bugfix.
- Fixture level: expanded; owner-approved implementation contract, no unresolved policy choice.
- Blast radius: Office save-as recovery outcome, journal responsibility and private-name deletion authority.
- Selected packs: entrypoint, file IO/path safety, persisted schema, ownership, state/order, compatibility, error/durability, documentation.
- Evidence floor: actual retained-intent SIGKILL/root-removal baseline RED, owning regressions, fresh-process recovery and repeated-crash/uncertainty controls, preserved immutable history and completed-replay no-op.
- Cross-repository boundary: production/tests/changelog in `DankerMu/open-computer-use`; fixture, decision clarification and bound evidence in this repository.

## What Changes

- Route both missing-outputs-root completion branches through the existing save-as private-retirement owner before recording a terminal outcome.
- Preserve an already-durable retained failure reason, specifically `publish_timeout`; absent such a reason, retain ordinary `workspace_missing` behavior.
- Refuse uncertain ownership or durability without deleting unproven objects or clearing the obligation; resume already-durable retirement steps idempotently.

## Capabilities

### New Capabilities

- `ocu-missing-root-retirement`: outcome precedence and bound-private retirement when outputs disappears during save-as recovery. The broader publication contract remains in the active `ocu-office-editing` change; no existing canonical capability is duplicated or historical change edited.

### Modified Capabilities

None.

## Impact

Source owner: `computer-use-server/office/save_as.py`; owning tests: `tests/orchestrator/test_office_save_as.py`, reusing its real crash/fresh-worker harness. Publication journal/Stage helpers are existing dependencies, not alternate implementations. No outputs-root recreation, unrelated private scan/collection, selected-version/history mutation, dependency change or production deployment.
