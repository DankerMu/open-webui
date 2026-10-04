---
id: 2026-10-04-ocu-workspace-file-tree
title: Loaded workspace files render as a local collapsible tree
kind: architecture
status: implemented
date: 2026-10-04
supersedes: none
references: 2026-09-27-ocu-workspace-files-consumer, 2026-09-27-ocu-workspace-controls, DankerMu/open-webui#181
---

# Loaded workspace files render as a local collapsible tree

## Problem

A column of bare names hides directory context, kind and size, and selected identity is only `aria-pressed`. The Files list is the surface users judge, but grouping already lives in the display-row model and must not become a second classifier or store.

## Decision

`WorkspaceArtifact` consumes `buildWorkspaceFileRows` and `workspaceFileKind` unchanged. Folder headers are real buttons whose accessible name starts with `Folder` and whose `aria-expanded` tracks a panel-local collapsed-path map that starts expanded and resets when the panel unmounts. File buttons keep accessible name `file.name || file.path`; visible text and tooltip use the display-row name; kind icons and formatted size are decorative. Selected rows keep `aria-pressed=true` and a filled background with stronger text. Collapse never requests, retargets, or persists. More files stays a named muted control outside the `ul`. With a selection the scrolling list is capped near two fifths of the panel; without one it fills remaining height. Header, selected-file bar, frame policy and Office re-click remain the existing controller contracts.

## Alternatives considered

- **Persist collapsed folders** — would invent a preference the listing identity contract does not own.
- **Export a type alias or second classifier** — duplicates #180 and can drift from preview/edit eligibility.
- **Put More files inside the list** — would break `ul li` pagination counts used by existing browser cases.

## Consequences

The nested stub scenario is the only listing that advertises nested bytes; HTTP proof must fetch those URLs rather than invent listing fiction. Browser evidence for headers, indentation, collapse, selection styling and list geometry lives with the nested scenario. TSV classification remains #239.
