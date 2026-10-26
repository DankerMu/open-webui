---
id: 2026-10-26-ocu-workspace-nav-entry
title: The workspace entry is a navbar icon beside Controls
kind: feature
status: implemented
date: 2026-10-26
supersedes: none
references: openspec/changes/ocu-workspace-nav-entry, DankerMu/open-webui#646
---

# The workspace entry is a navbar icon beside Controls

## Problem

During VPS acceptance on 2026-10-26 the owner pointed at the closed-panel state (#646): the floating `Workspace Files` text card under the chat navbar looked out of place, sat about 36 px below the navbar `Controls` icon and carried a long label. The same unstyled text button also appeared in the native Controls panel header, on desktop and in the mobile drawer.

## Decision

The workspace action is one icon button, `WorkspaceNavButton.svelte`, rendered in `Navbar.svelte` directly before the controls-permission block, so it exists even when that permission hides `Controls`. It uses the `Controls` button's size, colours and hover classes and a decorative folder icon; its accessible name and tooltip are `Workspace Files`. `aria-pressed` reports whether the workspace panel is shown. A change while closed shows a small dot and a visually hidden `Workspace changed` status; while the first send is pending the button is disabled with tooltip and visually hidden status `Waiting for chat to save`.

`ChatControls.svelte` keeps all workspace logic and is the only writer of the `ocuWorkspaceEntry` store in `src/lib/stores/ocu.ts`. It publishes `{ shown, changed, waiting, disabled, toggle }` while the workspace action is available and `null` otherwise or after it unmounts. `toggle` reads the live panel state when called: closed runs the existing `openWorkspace` (save ordering and change acknowledgement unchanged), shown runs the existing guarded `closeWorkspace`, so an open Office editor departs through the leave guard first. The floating card and both header text buttons are gone; the `workspaceError` alert stays where it was.

## Alternatives considered

- **A fixed-position button next to `Controls`** — breaks whenever the navbar adds Temporary Chat, Save Chat or New Chat icons, or the controls permission hides `Controls`.
- **Move the workspace logic into the navbar** — duplicates the `ChatControls` state (visibility rule, pending save, Office guard) and grows the diff to an upstream file.
- **Keep a second entry in the mobile Controls drawer** — `Drawer.svelte` has no `aria-modal` or `inert`, so two buttons named `Workspace Files` would both stay in the accessibility tree.

## Consequences

The entry is visible in more states than before, including while the panel is shown, and toggles the panel closed there; browser helpers that probed for the entry while the panel was shown now check the panel first. On mobile the Controls drawer covers the navbar, so with native Controls open the user closes the drawer before reaching the entry, and the mobile workspace closes through `Close workspace` or by closing the drawer. `Navbar.svelte` (upstream) gains two lines.
