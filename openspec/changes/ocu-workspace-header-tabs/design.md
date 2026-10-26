## Context

`WorkspaceArtifact.svelte` (728 lines) renders `<section aria-label="Workspace Files" class="flex h-full min-h-0 flex-col gap-2 p-3">`. Inside it, in order:

- `<header>` (`:414-450`): `h2` title, a count `span` (`fileCount`, `workspace.nextCursor`), and on the right Refresh (`bind:this={refreshButton}`) and Close (`onClose`), `size-8` icon buttons with tooltips;
- `<WorkspaceViewSwitch {workspace} onSelect={selectView} bind:filesButton />` (`:451`);
- notice, runtime frame or Files area.

`WorkspaceViewSwitch.svelte` renders `nav aria-label="Workspace views"` with an `inline-flex` segmented container. Its buttons are `h-8 px-3`, each with an icon and a label.

The outer panel's minimum width is 350 px (`ChatControls` resizable panel). The section has `p-3`, which leaves about 326 px.

## Decisions

### D1. One header row

The `<header>` keeps its classes (`flex shrink-0 items-center justify-between gap-2 border-b … pb-2`) and holds:

- `<WorkspaceViewSwitch …/>` as its first child, `min-w-0`;
- the existing right-hand button group unchanged.

The `h2` and the count `span` are deleted, and the separate `<WorkspaceViewSwitch>` line below the header is removed. `fileCount` is deleted if nothing else uses it (check `:96`).

### D2. Icon-only segments when narrow

`WorkspaceViewSwitch`:

- the `nav` gets `@container` (container queries are already used, e.g. `WorkspaceSelectedFile.svelte`) and `min-w-0`;
- each label is wrapped in `<span class="hidden @min-[230px]:inline">` (the threshold is tuned so the three labelled segments fit; record the measured value);
- below the threshold, each button shows only its decorative icon and keeps its accessible name through `aria-label` equal to the label (`Files`, `Browser`, `Terminal`);
- each button is wrapped in the existing `Tooltip` with the label as content, so mouse users see it when only the icon shows.

The pressed, disabled and absent logic is unchanged.

Rejected:

- keeping the count somewhere else: YAGNI, since `More files` already signals more pages;
- a separate overflow menu for views: three items fit as icons.

### D3. Tests and specs that referenced the removed parts

- Vitest cases that assert the count text (`3 files`, `100+ files`) are rewritten to assert its absence, plus `More files` presence for the paged case.
- Cases that rely on the switch being a separate row (DOM order) are rewritten to find it inside the header.
- Browser specs keep working by name.

## Risks / Trade-offs

- Users lose the at-a-glance count. The tree shows the files and `More files` signals more.
- At the minimum width the views become icons. The labels are still in tooltips and accessible names.

## Evidence plan

a. `WorkspaceViewSwitch.test.ts`:

- labels are inside the hidden-below-threshold span (class presence);
- each button keeps its accessible name, pressed and disabled states, and absence;
- each button has a tooltip.
  b. `WorkspaceArtifact.test.ts`:
- the header contains the `Workspace views` nav plus Refresh and Close;
- no `Workspace Files` heading and no file-count text, with three files and with a next page;
- `More files` is present with a next page;
- `section[aria-label="Workspace Files"]` is present;
- notice dismissal still focuses `Files` while busy.
  c. Browser (`e2e/ocu-controls.e2e.ts` or `ocu-workspace.e2e.ts`):
- the switch and the Refresh button share one row (vertical centres within 2 px);
- at a 350 px panel the header does not overflow horizontally and the segments are icon-only;
- at the default width the labels are visible;
- screenshots light/dark at the default and minimum width, and at a 390 px viewport.
