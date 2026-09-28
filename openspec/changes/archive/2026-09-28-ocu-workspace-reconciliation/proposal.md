# Proposal

## Why

Issue32 connects the merged workspace consumer to chat events, polling, history restore and message links. Issue30 supplies accepted-state panel policy; issue92 supplies nested persisted prefs. Without a chat-owned producer, a closed panel cannot discover output and history cannot restore from server truth.

## What Changes

- One active-chat coordinator owns describe/listing, foreground/background cadence, hint consumption, reconnect, coherent paging and preference restoration. Extract the existing Files reconciler; do not add a parallel implementation.
- Chat.svelte adds an early hint branch and one delegated messages-container click handler. The handler uses the existing recognizer with an absolute same-origin base and resolves authoritative file_id across paging.
- WorkspaceArtifact becomes a data consumer while retaining preview DOM/Office lifecycle. The minimal ChatControls preference-write hook joins the same hydration-aware writer so opening before describe cannot erase the persisted selection.
- Native harness proves server-event delivery, no-event polling, reload and actual owned backend/stub process restart without Docker.

Fixture level: expanded — upstream hooks, async shared state, event/GET authority and iframe lifecycle. Selected packs: concurrency/identity, API/persistence compatibility, resource lifecycle, UI integration/oracle integrity. Not selected: production auth/schema changes, OCU changes, dependencies, deployment/network; real Docker acceptance remains final issue36.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-workspace-store`: single active-chat producer, authoritative restoration and stale data/hint handling.
- `ocu-link-recogniser`: delegated current-chat link consumption using the unchanged pure recognizer.
- `ocu-workspace-files`: data-owner cutover and live preview refresh without changing trust boundaries.

## Impact

Fork-owned coordinator and paired tests, existing ocu store/API/WorkspaceArtifact/tests, minimal Chat.svelte hooks and ChatControls preference writer, existing browser harness/fixtures and generated locales when new strings require them. No Markdown/message-renderer edits. Data-fetch deletion and caller migration are one atomic cutover; an explicit diff-size justification may be required rather than weakening coverage or leaving two owners. Sources: merged controls and preference decisions, umbrella D8/D17, reconnaissance reports ReconcileEventLinkSeams and ReconcileDataOwnershipSeams.
