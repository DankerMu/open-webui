## Why

(#646). During VPS acceptance on 2026-10-26 the owner pointed at the closed-panel state: the floating `Workspace Files` text card under the chat navbar looks out of place, does not line up with the navbar `Controls` icon and carries a long label.

Today (`main` `eb38d9d21`) the workspace action has two text forms in `src/lib/components/chat/ChatControls.svelte`:

- `:319-333`: while the workspace panel is not shown, a `fixed right-3 top-14` card with a plain text button `Workspace Files` and `Workspace changed` / `Waiting for chat to save` status text, about 36 px below the `Controls` icon (`Navbar.svelte:233-245`);
- `:413-427` (mobile drawer, `!largeScreen`) and `:557-571` (desktop side panel): the same unstyled text button and status text in the native Controls panel header next to the `Controls / Files / Overview` tabs.

## What Changes

In this repo (WebUI fork):

- One entry: a new `WorkspaceNavButton.svelte`, rendered in the chat navbar directly before the `Controls` button (one import and one element in `Navbar.svelte`). Folder icon in a `size-6` button with the `Controls` button's classes; tooltip and accessible name `Workspace Files`; a small dot when the workspace changed while closed, with the `Workspace changed` status kept visually hidden; disabled with tooltip and visually hidden status `Waiting for chat to save` while the first send is pending; `aria-pressed` = workspace shown; click opens (existing `openWorkspace`) or closes (existing `closeWorkspace`).
- `ChatControls.svelte` keeps all workspace logic and publishes the entry state through a new store `ocuWorkspaceEntry` in `src/lib/stores/ocu.ts`; it removes the floating card and both header text buttons.
- Spec `ocu-workspace-controls`: ADDED "Workspace entry sits in the navbar".

Must preserve:

- Visibility rule `workspaceActionAvailable` (hidden for temporary and unsaveable chats, visible for unsaved saveable chats); save ordering, shared save, first-send pending, save failure and navigation-during-save behaviour (`openWorkspace` unchanged).
- Open acknowledges a change exactly as today; close goes through `closeWorkspace` (Office leave guard).
- The accessible name `Workspace Files` on exactly one button; `section[aria-label="Workspace Files"]` panel unchanged; the `workspaceError` alert unchanged.
- Native Controls, Artifacts, Embeds and Call panels keep their lifecycle; opening the workspace from one of them still closes them (existing `openWorkspace`).

Out of scope: the `workspaceError` alert position, zh-CN translations, the workspace panel's own header, `Controls` button behaviour.

## Capabilities

### Modified Capabilities

- `ocu-workspace-controls`: ADDED "Workspace entry sits in the navbar".

## Impact

The workspace entry looks like the neighbouring navbar icons and stays in place whether the panel is open or closed.

## Triage

```text
Issue type: UI change (owner request)
Fixture level: expanded
Upstream suggested level: absent; expanded: upstream navbar touched, entry state moves across components, close path runs the Office leave guard
Blast radius: every chat's workspace entry; a broken store wiring hides the only entry, a wrong toggle closes a panel with unsaved Office edits without the guard
Selected risk packs: UI / accessibility; Invariant / state (entry state vs chat, unmount); Office edit safety (close through guard)
Evidence floor: Vitest for each spec scenario (red first); make test-frontend; make typecheck; make lint-scoped; make coverage-gate (name new files); make verify-ui-ocu with screenshots (light and dark, closed and open); make verify-ui; make doc-gate; make decisions-verify
design.md: present
```
