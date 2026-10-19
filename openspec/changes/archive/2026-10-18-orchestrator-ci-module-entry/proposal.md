# Proposal

## Why

The declared orchestrator CI console command fails before collection on Python3.13 because the checkout root is not importable for its package-qualified fixture import. Module entry resolves the same selection without fixture or path configuration changes.

## What Changes

- Change only the orchestrator invocation in the existing workflow to `python -m pytest tests/orchestrator/ -v`.
- Document the CI entrypoint requirement in the existing tests README and retain local Linux verification evidence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-pytest-discovery`: the orchestrator CI step exposes the checkout namespace without changing its selection.

## Impact

OCU `.github/workflows/build.yml` and `tests/README.md`; control contract/evidence here. No test, fixture, production, dependency or other workflow command changes. Flag the CI-file change in the PR.

## Triage

Issue type: bugfix.
Fixture level: expanded — shared CI/script entrypoint, despite a one-line code diff.
Upstream suggested level: absent.
Blast radius: orchestrator job collection; all other job surfaces remain unchanged.
Selected packs: script entry, project setup, discovery/selection, compatibility/examples, documentation.
Evidence floor: exact console RED on declared Python3.13/job dependencies without PYTHONPATH; module-entry collection with exact same-environment node equality; complete corrected orchestrator execution and explicit outcomes.
