# Proposal

## Why

Issue30 completes the controls around the merged saved-chat Files panel. Saveable unsaved chats need the existing upstream persistence path before OCU access, and runtime tabs can now consume the reviewed selected-view embedding prerequisite from issue89.

## What Changes

- Extend existing ChatControls hooks with an always-reachable flag-gated workspace action, unsaved-chat save callback, open/close/change state and one-time automatic-open policy.
- Add Files/Browser/Terminal selection using existing WorkspaceArtifact and chat-keyed state; runtime views use the merged OCU embed modes, never raw WebSocket iframe URLs.
- Preserve native panels, fixed iframe policies and Files state; localize workspace UI through the existing i18n pipeline.
- Extend actual WebUI acceptance for unsaved/temporary chats, chat-switch races, runtime teardown and stopped Launch; preserve A-T01/A-T10/baseline.

## Capabilities

### New Capabilities

- `ocu-workspace-controls`: saveable-chat entry, panel lifecycle policy and runtime tab selection.

### Modified Capabilities

- `ocu-workspace-files`: distinguish unsaved workspace action from the saved-chat-only mounted Files consumer.

## Impact

ChatControls.svelte and the user-approved minimal Chat.svelte save callback/prop/adoption guards; existing WorkspaceArtifact, OCU store/API seams as needed; paired tests, existing stub/isolated browser harness, generated i18n outputs and reviewed OCU pin. No other upstream production component changes unless an existing named native-Artifact coexistence hook is necessary. No new dependencies or backend API changes.

## Fixture and Evidence

Expanded fixture: lifecycle/order (save race, chat switch, first-output latch), trust (fixed runtime/generated frames), integration (upstream persistence and real runtime assets), compatibility (native panels and flag/temporary exclusions). Construction RED before implementation and parent-run actual UI checks, semantic mutation qualification and independent three-seat review. Issue32 owns socket hints, ongoing polling, history restoration and message-link interception; no duplicate producer is added here. Real A-T05/A-T09 and Docker acceptance remain issue36.
