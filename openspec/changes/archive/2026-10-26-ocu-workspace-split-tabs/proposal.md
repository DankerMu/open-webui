## Why

(#643). During VPS acceptance on 2026-10-25 the owner asked that a clicked workspace file open beside the file tree, VS Code style, instead of under it. Owner decision (2026-10-25): the sidebar splits left/right in the Files view; Browser and Terminal stay top-level views that take the whole sidebar.

The #642 tree component is merged (`e0b291810`); its change is archived as the first commit of this branch.

Today a selection caps the list at two fifths of the panel height and stacks the selected bar and preview below it (`WorkspaceArtifact.svelte` list height classes, selected region; spec `openspec/specs/ocu-workspace-files/spec.md` "File tree preserves pagination and preview space"). Only one file is ever open; there is no way to return to "nothing selected" except a deletion.

## What Changes

In this repo (WebUI fork), Files view only:

- No open file: the tree (`WorkspaceFileTree.svelte`, from #642) uses the full width, as today without a selection.
- Open files: the area splits into a tree column on the left and the opened file on the right. The tree column stays mounted (no remount on the first open or last close), has a small splitter (`WorkspaceTreeSplitter.svelte`, panel-lifetime width, CSS bounds keep the right column at least 200 px) and can be hidden with a toggle.
- The right column starts with a tab bar of opened files (new `WorkspaceFileTabs.svelte`). Clicking a tree row opens or activates its tab through the existing `selectFile`; the active tab is the persisted selection. Closing a tab activates its right neighbour (else left); closing the last one clears the selection through a new controller `clearSelection` that writes `selected_file_id: null`.
- Below the tabs, the existing selected region (`Selected workspace file`: bar, Office status, dialogs, preview / editor) fills the column's height. The two-fifths cap is removed.
- Tab list helpers live in a pure module `workspace-tabs.ts` with paired tests.
- The Files/Browser/Terminal switch segments size to their content instead of stretching (`flex-1`); spec `ocu-workspace-controls` MODIFIED "Theme-aware workspace panel chrome".
- The view switch moves to `WorkspaceViewSwitch.svelte` (keeps `WorkspaceArtifact.svelte` under 800 lines).
- `WorkspaceSelectedFile` hides directory and size below a container width of about 280 px so the bar never overflows in a narrow column.
- Spec `ocu-workspace-files`: MODIFIED "File tree preserves pagination and preview space"; ADDED requirements for tabs, closing and the tree column.
- `docs/office-editing.md`: line 3 (choosing a file) if its wording no longer fits; line 11 lists the actions that save on leave, add switching or closing a file tab.

Must preserve:

- Office semantics: the active tab is `selectedFileId`; switching away from, or closing, the tab of an open editor goes through `guardOfficeAction` exactly like selecting another file today, and the tab change happens only if the guard's continuation runs. No hidden editor stays alive; inactive tabs render nothing.
- Accessible names: list `Workspace file list`, file rows exactly `file.name || file.path` (buttons), folder rows, region `Selected workspace file`, view buttons, the single `Download <name>` link, `Close workspace`, `Refresh workspace files`. Tabs are `role="tab"` `div`s (not buttons); the close control is a button named `Close tab`, described by its tab, containing no file name.
- Generated-content and Office iframe sandbox/src/title, preview keyed lifecycle, message validation and deadlines; `officeMaximizeOverlay` on the selected region.
- Browser and Terminal replace the whole Files area at full width, as today; tabs survive switching back.
- Selection identity rules: deletion clears only after complete enumeration; the existing notice.

Out of scope: keeping several live Office editors, persisting the tab list, changing the outer panel width, Office editor internals, OCU server.

## Capabilities

### Modified Capabilities

- `ocu-workspace-files`: MODIFIED "File tree preserves pagination and preview space"; ADDED "Opened files show beside the tree in tabs", "Closing tabs keeps selection and Office edits coherent", "The tree column is resizable and can be hidden".
- `ocu-workspace-controls`: MODIFIED "Theme-aware workspace panel chrome" (content-sized switch).

## Impact

Clicking a file opens it beside the tree with the full sidebar height for preview and the Office editor. Users can return to a tree-only view by closing tabs.

## Triage

```text
Issue type: UI change (owner-decided)
Fixture level: expanded
Upstream suggested level: absent; expanded: product-visible layout change around the Office editor host (critical path), new controller action, upstream-file prop
Blast radius: every user's Files view; a wrong guard order loses unsaved Office edits, a wrong tab rule writes stale selection prefs
Selected risk packs: UI / accessibility; Invariant / state (tabs vs selection vs prefs); Office edit safety (leave guard ordering)
Evidence floor: Vitest for each spec scenario (red first); make test-frontend; make typecheck; make lint-scoped; make coverage-gate (name new files); make verify-ui-ocu (ocu-tree, ocu-workspace, ocu-office) with screenshots; make verify-ui; make verify-office if the pinned DocumentServer is available, else the PR says not verified; make doc-gate; make decisions-verify
design.md: present
```
