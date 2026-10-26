## Context

`buildWorkspaceFileRows` (`src/lib/components/chat/workspace-file-rows.ts:10-38`) is the only producer of display rows; `WorkspaceArtifact.svelte` consumes it for the list (`:583-648`), for `selectedRow` and for `selectedDirectory` through the `fileFolder` membership array (`:154-162`, `:392-406`). Collapse state is a component-local `Set` of folder paths (`:385-391`). The component is 796 lines; `constraints.yaml` forbids a fork-touched file growing while over 800.

## Decisions

### D1. Row model

```ts
type WorkspaceFileRow =
	| { kind: 'folder'; path: string; name: string; depth: number }
	| { kind: 'file'; file: WorkspaceFile; name: string; depth: number; parent: string };
```

- Segments come from `file.path.split('/').filter(Boolean)`; the last is the display name (fallback `file.name` when the path has no segment), the rest are folders.
- Each distinct folder prefix produces one row: `path` the full prefix (`packages/core`), `name` its last segment (`core`), `depth` its segment count minus one.
- Order is depth-first: at each level all child folders by `name`, then all files by `name`, both by code-unit comparison (`<`, never `localeCompare`). Root files come after root folders.
- A file's `depth` equals its folder count; `parent` is the full directory path or `''`.
- Case-distinct segments stay distinct; leading or doubled slashes create no empty segment; inputs and their order are not mutated.
- Folder counts are dropped (no row shows them).

Alternative rejected: a nested object tree rendered recursively. A flat ordered row list keeps the existing keyed `{#each}`, focus continuity and UUID key separation (`folder:${path}` vs `file:${file_id}`) unchanged.

### D2. Collapse by ancestry

`hiddenByCollapse(row, collapsed: ReadonlySet<string>)` returns true when any proper ancestor folder of the row is collapsed: for a folder its ancestors are the prefixes of `path`; for a file, `parent` and its prefixes. Prefixes split on segment boundaries, so collapsing `a` hides `a/b` but not `ab`. The collapsed folder row itself stays visible with `aria-expanded=false`. Hidden rows keep the `hidden` attribute as today, so no request and no selection change.

### D3. `WorkspaceFileTree.svelte`

Props: `rows`, `selectedFileId`, `listClass` (height classes from the parent), `onSelect(file)`. It owns the collapse `Set` (panel lifetime, as today) and renders the `<ul aria-label="Workspace file list">`. `WorkspaceArtifact.svelte` keeps the empty/error states, `More files`, and the selected region; it computes `selectedDirectory` from the selected row's `parent`, so `fileFolder` is deleted. The parent passes the existing height classes as `listClass` (`max-h-[40%] shrink-0` with a selection, else `flex-1`); #643 replaces them.

`FILE_KIND_ICONS` moves to `<script context="module">` in `WorkspaceFileTree.svelte` and is exported; `WorkspaceArtifact.svelte` imports it for `SelectedKindIcon`. One definition, no copy.

### D4. Visual tokens (Claude Code Desktop / VS Code explorer)

- Row: `h-7` (28 px), `text-[13px]`, `rounded-md`, full-width button; left padding `8px + depth × 12px`.
- Indent guides: one 1 px vertical line per ancestor level, `border-gray-200 dark:border-gray-800`, decorative.
- Folder row: `ChevronRight`/`ChevronDown` 14 px muted, then `Folder`/`FolderOpen` 16 px muted, then the segment name in the regular text colour (not `text-xs` muted as today).
- File row: a 14 px empty slot where a chevron would be (names align with folder names), the 16 px kind icon muted inside the existing `<span data-file-kind class="contents">` wrapper (SVG `aria-hidden`), the name truncated, `WorkspaceFileMarker` on the right. No size, except a too_large row keeps `<span data-file-size>` with its formatted size beside the marker. Native `title` and the tooltip carry the full path.
- Hover `bg-gray-50 dark:bg-white/5`; selected `bg-gray-100 dark:bg-gray-800` with `font-medium text-gray-900 dark:text-gray-100` and `aria-pressed=true` (the selected style hook); visible `focus-visible:ring-2`.

All colours come from existing theme utilities; no new dependency or icon.

## Risks / Trade-offs

- Deep paths indent far in a narrow column; the name truncates and the tooltip keeps the full path. Accepted.
- Without per-row sizes, size is visible only after selection (selected bar). Owner direction; accepted.
- Folders with the same name at different depths are distinct rows because identity is the full path.

## Evidence plan

a. `workspace-file-rows.test.ts`: hierarchy for a three-level path, folders-before-files per level, code-unit order including uppercase, same basenames in separate folders, root-only, empty input, leading/doubled slashes, case-distinct folders, appended page keeps identities, inputs not mutated.
b. `hiddenByCollapse`: ancestor collapse hides descendants at every depth; sibling prefix (`a` vs `ab`) unaffected; the collapsed row itself visible.
c. `WorkspaceFileTree.test.ts` (required, paired with the new component) and `WorkspaceArtifact.tree.test.ts`: nested rendering with depth indentation, flat listing without folder rows, no size text on rows, collapse/expand without request or selection change, reset on remount and chat change, selected hook and Office re-click restart, glyph update in place, UUID folder/file keys, `More files`, the two-fifths cap kept.
d. `e2e/ocu-tree.e2e.ts`: nested folders, collapse of an intermediate folder, selection styling, light/dark screenshots, zero unexpected console/page errors.
e. A too_large row keeps its size beside its marker (`WorkspaceArtifact.too-large.test.ts:96`, `e2e/ocu-workspace.e2e.ts:679`). Selected bar still shows the directory for nested files and the size.
