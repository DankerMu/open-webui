## Context

After #642 (merge `e0b291810`), `WorkspaceArtifact.svelte` (703 lines) renders the header, the view switch `nav` (`:418-459`), state blocks (`:477-540`), then `WorkspaceFileTree` (`:542`, `listClass` `max-h-[40%] shrink-0` with a selection else `flex-1`, `bind:collapsed={collapsedFolders}`), `More files` (`:549-553`), then the selected region (`use:officeMaximizeOverlay`, `aria-label="Selected workspace file"`) with bar, preflight, Office status, conflict dialog, version history and the framed preview.

Selection is `workspace.selectedFileId`, written by `controller.selectFile` (`selectWorkspaceFile` + `writePrefs({view:'files', open:true, selected_file_id})`). The component's `selectFile` (`:283-296`) is `guardOfficeAction(() => editorChatId, run, file => file.file_id !== editorFileId)`; its `run` resets `localNotice`, restarts the Office preview on a re-click or clears `previewState`/`previewError`, then calls the controller.

`guardOfficeAction` (`office-leave-guard.ts:592-610`) departs an open editor before running the action. Every finished departure, including `failed`, `unconfirmed`, `conflict` and timeout, calls `release`, which runs the continuation (`:224-249`); the user sees the existing close-result notice (`docs/office-editing.md:11`). The continuation is dropped only when the departure is superseded or cancelled: another guarded action joins the departure and replaces it (`:361-365`), `synchronizeIntention` (`:450-452`), `cancelOwnerIntentions` from Close editor or detach (`:191-197`), or a new attach (`:532-538`). The component is remounted per chat (`ChatControls.svelte` `{#key chatId}`).

## Decisions

### D1. Tab list is component state derived against the listing

`openTabIds: string[]` lives in `WorkspaceArtifact.svelte` for the panel lifetime (same precedent as tree collapse). Pure helpers in `workspace-tabs.ts`:

- `withTab(ids, id)`: appends `id` if absent, returns the same array otherwise.
- `pruneTabs(ids, files)`: keeps ids whose `file_id` is in `files`, order unchanged.
- `tabAfterClose(ids, id)`: the id to activate after closing `id`: right neighbour, else left, else `undefined`.

Reactive rules, applied to the retained workspace (`retainOfficeWorkspace`), so a leave hold freezes them:

- whenever `selected` is defined and absent from the list, it is appended (tree clicks, restored prefs, link-click selection);
- whenever `workspace.files` changes, the list is pruned.

Accepted consequence: a refresh that returns a shorter window drops tabs of files outside it even though they were not deleted (the listing does not prove deletion; the tab is display state only).

Rejected: persisting tabs in prefs (backend schema change, not asked for).

### D2. Activating and closing

- `applySelection(file)`: the current body of `selectFile`'s `run` (notice reset, Office re-click restart or preview reset, controller call with the existing `Selection could not be saved` fallback). `selectFile` becomes `guardOfficeAction(..., applySelection, file => file.file_id !== editorFileId)`. One body, two callers.
- Tree row click: `selectFile(file)` as today (including the Office re-click restart).
- Tab click or Enter/Space on a tab: `selectFile(file)` only when the tab is not active; the tab component does not call `onActivate` for the active tab.
- Close of an inactive tab: removes it; no request, no guard.
- Close of the active tab: `closeTab = guardOfficeAction(() => editorChatId, run, id => id === editorFileId)`. `run` reads the live list (`pruneTabs(openTabIds, get(ocuWorkspaces)[chatId]?.files ?? [])`, because the continuation runs synchronously before Svelte flushes), removes the id, then calls `applySelection` for `tabAfterClose` or `controller.clearSelection(chatId)` when none remains. Inside `run` no second guarded call is made.
- A finished departure with a failed, unconfirmed or conflicting save still continues, exactly as switching files does today, and shows the existing result notice.
- A departure superseded by a second guarded action (for example clicking another tab while the close is pending) drops the first action and runs the second: the closed tab stays open and the second tab becomes active.
- A departure cancelled by Close editor (`closeOfficeEditor(chatId)`, which departs without a continuation) drops the action: tab and selection stay.
- When reconciliation clears the selection (complete enumeration proves the selected file absent), the other tabs stay, none is activated automatically, no extra preference write happens, and the right column shows `No file selected`.

### D3. `controller.clearSelection(id)`

Mirrors `selectFile`: returns early unless `id` is the active chat, clears the notice, `selectWorkspaceFile(id, undefined)`, then `writePrefs(id, { view: 'files', open: true, selected_file_id: null })`. The backend already accepts `null` (`backend/open_webui/routers/ocu_workspaces.py:66-67`) and restore maps it to undefined (`src/lib/stores/ocu.ts` `restoredSelectedFileId`). The component shows `Selection could not be saved` when the write fails.

### D4. Layout without remounting the tree

Inside the Files branch (no `runtimeUrl`), after the state blocks, one row container `flex min-h-0 flex-1` always holds the same tree column element, so the tree is never destroyed by opening the first tab, closing the last one or hiding the tree (scroll position, focus and collapse survive):

- tree column: `flex min-h-0 flex-col`, containing `WorkspaceFileTree` (`listClass` `flex-1`) and `More files`;
  - no open tab: `flex: 1 1 auto`, full width;
  - open tabs: `flex: 0 0 <treeWidth>px` with `min-width: 100px` and `max-width: calc(100% - 200px)` as CSS, so shrinking the outer panel never squeezes the right column below 200 px and needs no resize observer (outer panel minimum is 350 px, so the bounds never conflict);
  - hidden by the toggle: `hidden={treeHidden && openTabIds.length > 0}`, still mounted; with no open tab the toggle is gone (it lives in the tab strip), so the tree always shows and `treeHidden` is reset to false when the last tab closes.
- splitter (D7) between the columns, only while tabs are open and the tree is visible; it takes no layout width (zero-width element with an absolutely positioned hit area, as `ResizableSidePanel` does), so the 200 px bound is exact.
- right column, only while tabs are open: `flex min-w-0 flex-1 flex-col`: `WorkspaceFileTabs`, then the selected region when `selected` is defined, else a muted `No file selected` status.
- The two-fifths cap is removed.
- Office maximize keeps wrapping the selected region only.

### D5. `WorkspaceFileTabs.svelte`

Props: `tabs` (`{ file, name }[]` in list order), `activeId`, `treeHidden`, `onActivate(file)`, `onClose(fileId)`, `onToggleTree()`.

- Leading icon button toggles the tree: `aria-label` `Hide file tree` / `Show file tree`, `aria-expanded` = tree visible, `aria-controls` the tree column id.
- The tab strip is a horizontally scrolling flex row (no wrap). Inside it, an element with `role="tablist"` and `aria-label` `Open files` holds only the `role="tab"` elements (a `div`, never a `<button>`, so helpers that collect buttons by text never match a tab); each tab has an id, `aria-selected`, `tabindex` 0 when active else -1, a decorative kind icon and the truncated display name (`title` = full path). ArrowLeft/ArrowRight move focus between tabs; Enter/Space activate.
- Each tab is followed, outside the tablist element but inside a per-tab wrapper carrying `data-file-id`, by an icon button named `Close tab` with `aria-describedby` pointing at its tab, shown with `opacity-0 group-hover:opacity-100 focus-visible:opacity-100` (always visible on the active tab), never `hidden`.
- Styling (Claude Code Desktop / VS Code): `h-8` strip with a bottom hairline; tabs `text-[13px]`, `px-2`; active tab regular text colour, 2 px bottom accent and `bg-white dark:bg-gray-900`; inactive muted with hover background; theme utilities only.

### D6. View switch sizes to content

The `nav` (`aria-label` `Workspace views`) moves into a new `WorkspaceViewSwitch.svelte` (keeps `WorkspaceArtifact.svelte` under 800 lines) and becomes `inline-flex self-start`; segments drop `flex-1` and use `px-3`. Filled active segment, disabled state, capability-based absence, icons, labels, `aria-pressed` and the `filesButton` focus target used by notice dismissal stay as they are (the component exposes that button).

### D7. Splitter

A `role="separator"` element named `Resize file tree` (`aria-orientation="vertical"`, `aria-valuenow` = current width, `aria-valuemin` 100, `tabindex` 0) in a new `WorkspaceTreeSplitter.svelte`, bound to `treeWidth` (default 220, panel lifetime, not persisted). Pointer drag with pointer capture sets `treeWidth = clamp(startWidth + dx, 100, containerWidth - 200)`; ArrowLeft/ArrowRight change it by 16 px with the same clamp; CSS bounds (D4) still apply when the outer panel shrinks afterwards.

Rejected: reusing `ResizableSidePanel`. Its element would be the tree column only while split, so opening the first tab or closing the last would remount the tree and lose scroll and focus; its clamp follows only its own width and window resize, not the outer panel; it reads an absent storage key as width 0 (`ResizableSidePanel.svelte:109`), so a default width never applies; and its separator name `Resize panel` would duplicate the outer panel's (`ChatControls.test.ts:303`). Changing the upstream component for all of that touches more than a small splitter.

### D8. Selected bar in a narrow column

The right column can be 200 px wide. `WorkspaceSelectedFile` becomes a container (`@container`); the directory and size texts show only from a container width of about 280 px (`@min-[280px]:inline`, hidden below), the name truncates, actions stay; the bar never overflows horizontally. Download and the Office actions keep their names and order.

## Risks / Trade-offs

- At the default outer width (350 px, about 326 px inside) an open file gets 200 px and the tree about 126 px; the user can hide the tree or widen the panel. Accepted per owner choice of a split.
- Inactive tabs keep no state; switching back reloads the preview (Office editor needs Edit again). Accepted, matches today's selection switch.
- Tabs and tree width reset when the panel remounts (chat switch, close/reopen). Accepted.

## Evidence plan

a. `workspace-tabs.test.ts`: `withTab`, `pruneTabs`, `tabAfterClose` (right, left, last, absent id).
b. Controller `clearSelection`: store cleared and prefs written with `selected_file_id: null`; inactive chat ignored.
c. `WorkspaceFileTabs.test.ts`: tablist holds only tabs, tab is not a button, names and `aria-selected`, roving tabindex and arrows, Enter/Space on inactive tab activates and on active tab does not, `Close tab` names carry no file name and are described by their tab, toggle label/expanded/controls.
d. Component tests (Vitest asserts roles, names and presence only, not widths): no selection → no tablist and no splitter; tree click opens a tab, the splitter and the right column; second file adds and activates a tab; tab click switches through `selectFile`; close inactive; close active activates the right neighbour (left at the end); close last writes `selected_file_id: null` and leaves only the tree; the tree element is the same node before and after opening the first tab and after closing the last; hide toggle keeps the tree mounted with `hidden`; hiding the tree and then closing the last tab shows the tree again; restored selection appears as a tab; Browser hides the Files area and switching back keeps tabs; reconciliation deletion of the active file shows `No file selected`, keeps other tabs, makes no extra preference write; no two-fifths cap; separator named `Resize file tree`; selected bar hides directory/size below its container threshold (class presence).
e. Office: closing or switching away from the editor tab goes through the guard; a finished departure with a failed save still switches; a departure superseded by activating another tab drops the close (closed tab stays) and activates the second tab; a departure cancelled by `closeOfficeEditor(chatId)` keeps tab and selection; maximize still overlays the selected region.
f. View switch: segments have no `flex-1`, the nav does not stretch; existing pressed/disabled assertions unchanged; notice dismissal still focuses Files while busy.
g. Browser (`e2e/ocu-tree.e2e.ts` or a new spec): open two files, switch, close, hide/show the tree, resize with arrow keys and check widths; at a 390 px viewport the right column is at least 200 px and the bar does not overflow; light/dark screenshots of tree-only, split with two tabs, tree hidden and Browser full width.
