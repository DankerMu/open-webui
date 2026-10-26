## Context

`WorkspaceArtifact.svelte` (728 lines) renders `<section aria-label="Workspace Files" class="flex h-full min-h-0 flex-col gap-2 p-3">`. Inside it, in order:

- `<header>` (`:414-454`): `h2` title, a count `span` (`fileCount`, `workspace.nextCursor`), and on the right Refresh (`bind:this={refreshButton}`) and Close (`onClose`), `size-8` icon buttons with tooltips;
- `<WorkspaceViewSwitch {workspace} onSelect={selectView} bind:filesButton />` (`:455`);
- notice, runtime frame or Files area.

`WorkspaceViewSwitch.svelte` renders `nav aria-label="Workspace views"` with an `inline-flex` segmented container. Its buttons are `h-8 px-3`, each with an icon and a label.

The outer panel's default width equals its minimum, 350 px: `controlsWidth = 350` (`ChatControls.svelte:81`), `minWidth={350}` (`:468`), and `ResizableSidePanel.svelte:109-111` reads an absent stored size as `Number(null) = 0`, clamped to 350. The section has `p-3`, so about 326 px remain. With Refresh and Close (2 × 32 px plus gaps), about 250 px are left for the switch, while three labelled segments need about 293 px in English and 264 px in zh-CN (estimates, measure in the browser). So every first-time user sees the narrow state.

## Decisions

### D1. One header row

The `<header>` keeps its classes (`flex shrink-0 items-center justify-between gap-2 border-b … pb-2`) and holds:

- the left-slot wrapper (D2) as its first child;
- the existing right-hand button group unchanged.

The `h2` and the count `span` are deleted, and the separate `<WorkspaceViewSwitch>` line below the header is removed. `fileCount` is deleted if nothing else uses it (check `:96`).

### D2. Narrow state: the active segment keeps its label

- The header's left slot is a size container: `<div class="@container flex min-w-0 flex-1">` wraps `<WorkspaceViewSwitch …/>`. Put it in `WorkspaceArtifact` or as the outer element of `WorkspaceViewSwitch`. The `nav` itself stays `inline-flex shrink-0 self-start`, because an `inline-size` container cannot be content-sized.
- Each segment label is a span:
  - the active segment's label is always visible;
  - an inactive segment's label uses `hidden @min-[Npx]:inline`. N is the measured outer width of the whole nav with all three labels shown and the longest label (`Terminal`, English) active in `font-medium`: segment widths + 2 × `gap-1` + `p-1` + border. English is wider than zh-CN (`Browser` is untranslated and `浏览器` is shorter), so measuring English covers both. Record the measured N in the design and the decision record.
- Each button has `aria-label` equal to its label (`Files`, `Browser`, `Terminal`). It is wrapped in the existing `Tooltip` with the label as content. The tooltip is redundant when the label is visible; that is accepted.
- Pressed, disabled and absent logic is unchanged.
- The `filesButton` binding stays on the button.

Rejected:

- keeping the count somewhere else: YAGNI, since `More files` already signals more pages;
- a separate overflow menu for views: three items fit as icons.

### D3. Tests and specs that referenced the removed parts

- `WorkspaceArtifact.chrome.test.ts:77-97`: the count cases are rewritten. For all three rows, assert:
  - no text matching `/\d+\+? files/`;
  - no `h2`;
  - the `Workspace views` nav is a descendant of the header.

  For the paged case, also assert that `More files` is present. The `[0, null, null]` row's `header.querySelector('span')` null check (`:94`) is replaced, because the switch's label spans now live in the header.

- The spec scenario "Both application themes render intentional chrome" (requirement "Workspace state blocks preserve actions and isolation") drops "title, count" (MODIFIED in the delta).
- `npm run i18n:parse` removes `{{count}}+ files`, which no longer has a user (`keepRemoved: false`). `{{count}} files` stays because Knowledge uses it, and `Workspace Files` stays because the section and the navbar use it. The i18n diff must contain only that removal.

## Risks / Trade-offs

- Users lose the at-a-glance count. The tree shows the files and `More files` signals more.
- In the narrow state the inactive views become icons; their labels stay in tooltips and accessible names.
- In the narrow state, selecting another view shifts the segments horizontally: the old active segment shrinks to its icon and the new one grows to show its label. This is the cost of keeping the active label visible.

## Evidence plan

a. `WorkspaceViewSwitch.test.ts`:

- an inactive label carries the container-gated class and the active label does not;
- after the view changes, the classes follow the active segment;
- names, pressed state, disabled state and absence are unchanged;
- each button sits inside a Tooltip wrapper (`button.parentElement._tippy` defined).
  b. `WorkspaceArtifact.chrome.test.ts` per D3; notice dismissal still focuses `Files` while busy.
  c. Browser: extend `e2e/ocu-controls.e2e.ts:650` ("workspace chrome fits Files themes…") and reuse the 390 px pattern at `:612`.
- Default context (350 px, no `chatControlsSize`):
  - the switch and Refresh share one row (vertical centres within 2 px);
  - the Files label is visible, the Browser and Terminal labels are not;
  - every button box lies inside the nav box;
  - header `scrollWidth <= clientWidth + 1`.
- After selecting Terminal, only the Terminal label is visible.
- With `localStorage.chatControlsSize = 600` set before load, all labels are visible.
- Screenshots: light and dark at 350 px and at 600 px, plus a 390 px viewport.
- Measure N in English. zh-CN is covered by the width estimate plus one screenshot under zh-CN if the harness supports switching locale; otherwise state it as unverified.
