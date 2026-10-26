---
id: 2026-10-26-ocu-workspace-header-tabs
title: The workspace view switch replaces the panel title in one header row
kind: feature
status: implemented
date: 2026-10-26
supersedes: none
references: openspec/changes/ocu-workspace-header-tabs, DankerMu/open-webui#649, 2026-10-25-ocu-workspace-split-tabs
---

# The workspace view switch replaces the panel title in one header row

## Problem

During VPS acceptance on 2026-10-26 the owner judged the `Workspace Files  N files` title row in the workspace sidebar useless and asked for the Files / Browser / Terminal tabs to take its place (#649). Since #646 the navbar entry already carries the name `Workspace Files`. The panel's default width is its 350 px minimum, which leaves about 250 px for the switch beside Refresh and Close, too little for three labelled segments.

## Decision

`WorkspaceArtifact.svelte` renders one header row: on the left a size container `<div class="@container flex min-w-0 flex-1">` holding `WorkspaceViewSwitch`, on the right the unchanged Refresh and Close buttons, with the bottom hairline kept. The `h2` title, the loaded-file count (`fileCount`) and the separate switch row are deleted. The section keeps its accessible name `Workspace Files`, and the Files view's `More files` button still signals another page.

In `WorkspaceViewSwitch.svelte` each segment's label is a `span`. The active segment's label is always shown. An inactive label carries `hidden @min-[300px]:inline`, so it shows only when the header slot is at least 300 px wide. Each button has `aria-label` equal to its label and sits in the existing `Tooltip` with the label as content. The `nav` stays `inline-flex shrink-0 self-start`, sized to its content (`2026-10-25-ocu-workspace-split-tabs`). Pressed, disabled and capability-based absence, and the `filesButton` binding used by notice dismissal, are unchanged.

The threshold is the outer width of the `nav` with all three labels shown and the longest label, English `Terminal`, active in `font-medium`. It was measured by `e2e/ocu-controls.e2e.ts` in Playwright Chromium on macOS with the panel at 600 px: 294.6 px with the default stack, which resolves to the system font (`-apple-system`) on macOS, and 297.8 px with bundled Inter, which Windows and Linux fall back to. 300 px rounds the larger value up with about 2 px of margin for platform text rendering. A threshold that is too small makes the header overflow; one that is too large only hides the inactive labels a few pixels early. The browser case asserts that both measured widths stay at or below the threshold parsed from the rendered class, and writes them to `.run/ui-evidence/workspace-header-threshold.json`. zh-CN labels are shorter (`文件`, `终端`; `Browser` is untranslated), so the English threshold covers them. The same case checks that the zh-CN header fits at 350 px.

`npm run i18n:parse` removed the unused `{{count}}+ files` key from every locale. `{{count}} files` stays because Knowledge uses it.

## Alternatives considered

- **Keep the count elsewhere in the header** — YAGNI. The tree shows the loaded files and `More files` signals more pages.
- **An overflow menu for the views** — three items fit as icons. A menu adds a click and a second focus model.
- **Icon-only segments at every width** — wastes the room a widened panel has and hides the active view's name.
- **A `rem` threshold that follows the UI Scale slider** — the fixture specifies the pixel threshold. At the 350 px minimum, a scaled interface overflows regardless of the threshold unit (see Consequences).

## Consequences

Users lose the at-a-glance file count. In the narrow state the inactive views are icons, with their names kept in accessible names and tooltips. Selecting another view shifts the segments horizontally, because the old active segment shrinks to its icon and the new one grows. When labels are visible the tooltip repeats them. The threshold is in pixels and tracks neither the UI Scale slider (`--app-text-scale`) nor a custom app font. With a scale above 1 or a wider font, labels can show while the slot is narrower than the scaled `nav`, and at 350 px a strongly scaled header can overflow. This is not verified and was not fixed here.
