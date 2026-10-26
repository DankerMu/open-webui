---
id: 2026-10-25-ocu-workspace-split-tabs
title: Opened workspace files show beside the tree in tabs
kind: feature
status: implemented
date: 2026-10-25
supersedes: none
references: 2026-10-25-ocu-workspace-explorer-tree, 2026-10-04-ocu-workspace-file-tree, openspec/changes/ocu-workspace-split-tabs, DankerMu/open-webui#643
---

# Opened workspace files show beside the tree in tabs

## Problem

During VPS acceptance on 2026-10-25 the owner asked that a clicked workspace file open beside the file tree, VS Code style, instead of under it (#643). The selected file stacked below a list capped at two fifths of the panel height, only one file could be open, and nothing but a deletion returned the panel to "no file selected". Owner decision (2026-10-25): the Files view splits left/right; Browser and Terminal stay top-level views that take the whole sidebar.

## Decision

Without an opened file the tree fills the Files area. Opening a file splits the area into a tree column and an opened-file column. The tree column element is always the same node, so the first open, the last close and hiding never remount the tree (scroll, focus and collapse survive); while split it has a panel-lifetime width (default 220 px) with CSS bounds `min-width: 100px` and `max-width: calc(100% - 200px)`, and `hidden` while the tab-bar toggle hides it. `WorkspaceTreeSplitter.svelte` is a zero-width `separator` named `Resize file tree` with an absolute hit area; pointer drag and arrow keys (16 px) clamp to the same bounds. It reports `aria-valuemax` as the row width minus 200 px (at least 100) and `aria-valuenow` as the width that bound allows, measured on mount, focus and every use rather than through a `ResizeObserver`.

`WorkspaceFileTabs.svelte` holds one `div role=tab` per opened file in a `tablist` named `Open files` that contains only tabs; each `Close tab` button sits in a per-tab `data-file-id` wrapper outside the tablist, described by its tab. The tablist uses `display: contents` and CSS `order` so each close slot renders after its tab. Because the close buttons follow the whole tablist in the DOM, only the active tab's close button is in the Tab sequence (`tabindex=0`, the others `-1`): focus moves from the tablist to closing the current tab, never to a close button that renders elsewhere. With no active tab, no close button is in the Tab sequence until a tab is activated. The tab list is panel-lifetime component state (`workspace-tabs.ts`): the selection is appended, tabs of unlisted files are pruned. The active tab is the persisted selection. Activating a row or tab calls the existing guarded `selectFile`; closing the active tab is a second guarded action whose continuation reads the live listing, activates the right neighbour, else the left one, or calls the new controller `clearSelection` (`selected_file_id: null`). Both share one `applySelection` body. Office leave semantics are unchanged: a finished departure continues whatever its save outcome; a superseded or cancelled departure drops the action.

The view switch moves to `WorkspaceViewSwitch.svelte` and sizes to its content. The selected bar is a size container; below 280 px it hides directory and size and shows `Version history` as an icon with a tooltip, keeping that accessible name, so the bar fits a 200 px column.

## Alternatives considered

- **Reuse `ResizableSidePanel` for the tree column** — its element would be the tree column only while split, so the first open or last close would remount the tree and lose scroll and focus; its clamp follows only its own width and the window, not the outer panel; it reads an absent storage key as width 0, so a default never applies; and its separator name `Resize panel` would duplicate the outer panel's. Changing the upstream component for all of that touches more than a small splitter.
- **Persist the tab list in workspace preferences** — needs a backend schema change nobody asked for; the selection already persists.
- **Keep the stacked layout and raise the list cap** — still one file at a time and no way back to "nothing selected"; the owner request is unmet.
- **Wrap each tab and its close button in one element inside the tablist** — the tablist would then own buttons, which assistive technology reads as a malformed tab list.

## Consequences

At the default 350 px panel an opened file gets 200 px and the tree about 126 px; users can hide the tree or widen the panel. Inactive tabs keep no state, so switching back reloads the preview and an Office editor needs Edit again. Tabs and the tree width reset when the panel remounts. A refresh that returns a shorter listing window drops tabs of files outside it, because the tab is display state only. Hovering a tab reveals its close button through component state, since the button is not a DOM descendant of the tab's hover group. A hidden close button ignores pointer input until revealed, so a tap on an inactive tab's empty close slot closes nothing; devices without hover always show it. The global `.hover-reveal` class is not reused: it reveals only on its own group, and as an unlayered rule it outranks the Tailwind utilities that would add the tab-hover and no-hover cases.
