# Proposal

## Why

Issue29 adds the first usable workspace sidebar slice. The merged issue84 Office embedding and issue64 failure contracts now permit real selection and honest error states without duplicating renderers or interpreting failed requests as empty workspaces.

## What Changes

Add WorkspaceArtifact.svelte with Files-only state machine, authorized listing/pagination, selected-file preview and parent-owned downloads. Add the smallest flag-gated saved-chat mount in ChatControls; full button/unsaved-chat/Browser/Terminal behavior remains issue30 and history/event integration remains issue32.

## Capabilities

### New Capabilities

- `ocu-workspace-files`: mounted Files sidebar, state/selection contract and browser isolation evidence.

## Impact

New component and paired tests; existing OCU store/API modules; hook-sized ChatControls/main.py config flag changes; existing browser/proxy/stub harness extension and Makefile/CI test wiring. User approved fixed jsdom26.1.0 development dependency, manifest/lockfile updated without other upgrades. OCU source is consumed from reviewed Git blobs; no OCU source edits.

## Fixture triage

Expanded: iframe trust, asynchronous chat/selection lifecycle, failure/pagination semantics, upstream hook compatibility and real browser evidence. Required A-T01/A-T10 use actual mounted WebUI and proxy, not only a protocol mock. No weakened coverage thresholds. No Docker before final issue36 acceptance.
