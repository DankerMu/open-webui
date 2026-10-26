---
id: 2026-10-25-ocu-workspace-explorer-tree
title: Workspace Files render as a nested explorer tree
kind: feature
status: implemented
date: 2026-10-25
supersedes: none
references: 2026-10-04-ocu-workspace-file-tree, openspec/changes/ocu-workspace-nested-tree, DankerMu/open-webui#642, DankerMu/open-webui#643
---

# Workspace Files render as a nested explorer tree

## Problem

During VPS acceptance on 2026-10-25 the owner judged the Files sidebar unlike common file explorers and asked for a Claude Code Desktop / VS Code style (#642). Rows were grouped by whole directory path (`packages/core/src` as one header with a count) and every row carried a size, which crowds a narrow column. `WorkspaceArtifact.svelte` was at 796 lines, so the list could not grow in place.

## Decision

`buildWorkspaceFileRows` returns a flat, depth-first row list: one folder row per distinct path prefix (full `path`, last-segment `name`, `depth`), folders before files at every level, code-unit order, and file rows carrying `depth` and `parent`. Rows carry no counts. `hiddenByCollapse` hides a row when a proper ancestor folder, compared on whole segments, is collapsed; the collapsed row itself stays visible.

`WorkspaceFileTree.svelte` renders the list: 28 px rows indented `8px + depth × 12px`, decorative indent guides, chevron and folder icon on folders, an empty chevron slot and kind icon on files, full-path native title and tooltip, no row size except beside the too-large marker. It exports `FILE_KIND_ICONS`, which `WorkspaceArtifact` reuses for the selected bar. `WorkspaceArtifact` keeps empty/error states, More files and the selected region, passes the list height classes as `listClass`, derives the selected directory from the row's `parent`, and holds the collapsed-path `Set` bound into the tree so collapse lasts as long as the open panel, including Browser/Terminal switches. Accessible names, keys (`folder:<path>`, `file:<file_id>`), selection and Office behaviour are unchanged.

## Alternatives considered

- **Recursive nested object tree rendered by a recursive component** — loses the single keyed `{#each}`, focus continuity on refresh and the folder/file key separation that the flat list already guarantees.
- **Keep full-path group headers and add indentation** — still not a tree; a three-level path stays one header and the owner request is unmet.
- **Collapse state owned only by the tree component** — the tree unmounts when the Browser or Terminal view is shown, so switching views would silently expand every folder; the panel already owned this lifetime.
- **Keep per-row sizes** — owner direction is a compact explorer; size stays visible in the selected bar and on too-large rows, where it explains the marker.

## Consequences

Selectors that relied on full-path header text or per-row sizes change; accessible names do not. Folder labels are now prefixes of each other (`Folder packages`, `Folder packages/core`), so browser selectors use exact matching. Deep paths indent far in a narrow column; names truncate and the tooltip carries the full path. The split layout with tabs (#643) builds on this component.
