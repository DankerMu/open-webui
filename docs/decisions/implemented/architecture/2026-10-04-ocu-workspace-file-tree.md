---
id: 2026-10-04-ocu-workspace-file-tree
title: Loaded workspace files render as a local collapsible tree
kind: architecture
status: implemented
date: 2026-10-04
supersedes: none
references: 2026-09-27-ocu-workspace-files-consumer, 2026-09-27-ocu-workspace-controls, DankerMu/open-webui#181, DankerMu/open-webui#248, 2026-10-25-ocu-workspace-explorer-tree
---

# Loaded workspace files render as a local collapsible tree

## Problem

A column of bare names hides directory context, kind and size, and selected identity is only `aria-pressed`. The Files list is the surface users judge, but grouping already lives in the display-row model and must not become a second classifier or store.

## Decision

`WorkspaceArtifact` consumes `buildWorkspaceFileRows` and `workspaceFileKind` unchanged. Folder headers are real buttons whose accessible name starts with `Folder` and whose `aria-expanded` tracks a panel-local collapsed-path `Set` that starts empty (every group expanded) and resets when the panel unmounts. Since 2026-10-25 the rows form a nested explorer tree and collapse hides by ancestry (`2026-10-25-ocu-workspace-explorer-tree`); a file row carries its own `parent`. The keyed each namespaces presentation identity as `folder:<path>` and `file:<file_id>` without changing domain paths, file IDs, selection, or reconciliation. File buttons keep accessible name `file.name || file.path`; visible text uses the display-row name (since 2026-10-25 the tooltip shows the full path); kind icons are decorative, and since 2026-10-25 only too-large rows show a size. Selected rows keep `aria-pressed=true` and a filled background with stronger text. Collapse never requests, retargets, or persists. More files stays a named muted control outside the `ul`. With a selection the scrolling list is capped near two fifths of the panel; without one it fills remaining height. Header and preview policy stay unchanged; selected-file chrome is the compact bar and framed remaining-height surface owned by the Files consumer contract.

File rows retain `file_id`-based identity; their decorative icons use explicit dynamic components, matching the selected-file icon convention, so accepted type/MIME changes update the glyph without replacing the selectable button or requiring reselection.

## Alternatives considered

- **Persist collapsed folders** — would invent a preference the listing identity contract does not own.
- **Export a type alias or second classifier** — duplicates #180 and can drift from preview/edit eligibility.
- **Put More files inside the list** — would break `ul li` pagination counts used by existing browser cases.
- **Ordinary object collapse map** — inherited `constructor`/`toString`/`__proto__` look already collapsed, and the removal branch cannot clear them.
- **Share keyed-each keys between folder path and file_id** — a UUID-named directory collides with a distinct file that already uses that id.
- **Per-row backscan for folder membership** — repeats grouping already present in the canonical row list.
- **Include display kind in the row key** — would replace the selectable row on kind changes, discarding its identity and focus.

## Consequences

The nested stub scenario is the only listing that advertises nested bytes; HTTP proof must fetch those URLs rather than invent listing fiction. Browser evidence for headers, indentation, collapse, selection styling and list geometry lives with the nested scenario. TSV metadata uses the canonical classifier: the `text/tab-separated-values` MIME and broker `spreadsheet` type map to `sheet`, with recognized MIME taking precedence. This decorative classification grants no Office preview or edit capability.
