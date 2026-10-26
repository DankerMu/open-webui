## Why

(#642). During VPS acceptance on 2026-10-25 the owner judged the workspace Files sidebar inconsistent with common file explorers and asked for a Claude Code Desktop / VS Code style. The current list is not a tree:

- `src/lib/components/chat/workspace-file-rows.ts:10-38` groups files by their whole directory path, so `packages/core/src/index.py` shows one header `packages/core/src` with a count; `openspec/specs/ocu-workspace-files/spec.md:101` requires exactly that.
- Every file row carries a muted size and every header a count (`WorkspaceArtifact.svelte:588-640`), which crowds a narrow column.

The split layout with tabs is the follow-up (#643) and builds on the tree component extracted here.

## What Changes

In this repo (WebUI fork):

- `buildWorkspaceFileRows` returns a real hierarchy: one folder row per path segment with its depth, folders before files at each level, code-unit ordering, and a `parent` path on file rows. A pure helper decides whether a row is hidden by a collapsed ancestor.
- A new `WorkspaceFileTree.svelte` renders the list (moved out of `WorkspaceArtifact.svelte`, which is at 796 lines and may not grow past 800): compact explorer rows, indent guides, chevron only on folders, 16 px kind icons, no sizes or counts. Collapsing a folder hides all its descendants.
- A file marked too_large keeps its size beside its marker (`openspec/specs/ocu-workspace-oversized-file/spec.md:11`).
- The selected-file bar keeps showing the size and the directory (now the file row's `parent`).
- Spec `ocu-workspace-files`: three MODIFIED requirements (display rows, accessible tree, pagination and preview space).
- `e2e/ocu-tree.e2e.ts`, `workspace-file-rows.test.ts` and `WorkspaceArtifact.tree.test.ts` assert the new shape; new `WorkspaceFileTree.test.ts`.

Must preserve:

- accessible names: list `Workspace file list`, file rows exactly `file.name || file.path` with `aria-pressed`, folder rows `Folder <full path>` with `aria-expanded`, region `Selected workspace file`, view buttons `Files`/`Browser`/`Terminal` with `aria-pressed`, the single `Download <name>` link;
- selection callback, selected-Office re-click preview restart, `More files` pagination, the two-fifths list cap with a selection (removed only by #643), the in-place glyph update on refresh, UUID folder/file key separation;
- DOM hooks used by tests: the `<span data-file-kind>` wrapper around an `aria-hidden` SVG inside each row button, `WorkspaceFileMarker` hooks (`data-too-large`, `data-unsupported-name`), `data-file-size` on too_large rows, the selected row's medium font weight (`e2e/ocu-tree.e2e.ts:128`, `:222`);
- generated-content and Office iframe sandbox/src/title and all Office behaviour;
- no request from collapse; collapse state resets on panel close or chat change.

Out of scope: split layout and tabs and the view-switch restyle (#643), Office editor, OCU server, the outer panel width.

## Capabilities

### Modified Capabilities

- `ocu-workspace-files`: "Loaded workspace files have deterministic display rows", "Grouped workspace rows form an accessible local file tree", "File tree preserves pagination and preview space".

## Impact

Users see a nested, collapsible explorer tree. Any selector that relied on the full-path header text or on per-row sizes changes; accessible names do not.

## Triage

```text
Issue type: UI change (owner-requested)
Fixture level: expanded
Upstream suggested level: absent; expanded: product-visible change to a pure display model, a new component and a critical-path-adjacent panel
Blast radius: every user's Files list; a wrong collapse rule hides files, a wrong key mixes folder and file rows
Selected risk packs: UI / accessibility (names, focus, keyboard, theme); Invariant / state (ordering, identity, collapse by ancestry)
Evidence floor: Vitest for every scenario in the spec delta (red first); make test-frontend; make typecheck; make lint-scoped; make coverage-gate (name the new files); make verify-ui-ocu with ocu-tree light/dark screenshots; make verify-ui; make doc-gate; make decisions-verify
design.md: present
```
