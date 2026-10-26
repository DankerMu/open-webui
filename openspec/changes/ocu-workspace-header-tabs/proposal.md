## Why

(#649). Owner feedback on 2026-10-26 during VPS acceptance: the `Workspace Files  N files` title row in the workspace sidebar adds nothing. The Files / Browser / Terminal tabs should move into that row.

Today (`main` `93d51f86a`) `src/lib/components/chat/WorkspaceArtifact.svelte:413-450` renders two rows:

- a header with `h2` `Workspace Files`, a muted loaded-file count, Refresh and Close, and a bottom hairline;
- below it, `WorkspaceViewSwitch` (segmented Files / Browser / Terminal, content-sized since #643).

Since #646 the navbar entry already carries the name `Workspace Files`, so the visible title repeats it.

## What Changes

In this repo (WebUI fork):

- The header becomes one row: `WorkspaceViewSwitch` on the left, Refresh and Close on the right, bottom hairline kept. The separate switch row and the visible `h2` title go away. The panel keeps `section aria-label="Workspace Files"`.
- The loaded-file count goes away. The Files view already shows pagination through the `More files` button (`WorkspaceArtifact.svelte:554`), so the `+` signal is preserved there.
- `WorkspaceViewSwitch` becomes a size container. When the header is too narrow for icon plus label (the 350 px minimum panel holds three segments and two 32 px buttons), segments show the icon only. Their accessible names stay, and a tooltip shows the label.
- Spec `ocu-workspace-controls`: MODIFIED "Theme-aware workspace panel chrome".

Must preserve:

- Accessible names: `Workspace views` nav, `Files`, `Browser`, `Terminal`, `Refresh workspace files`, `Close workspace`.
- Pressed, disabled and capability-based absence of the views; refresh disabled and spinning while busy.
- The `filesButton` focus target used by notice dismissal.
- `section[aria-label="Workspace Files"]` and everything below the header: notices, state blocks, tree, tabs, frames.

Out of scope: zh-CN translation gaps (`Browser` untranslated), the navbar entry, panel width.

## Capabilities

### Modified Capabilities

- `ocu-workspace-controls`: MODIFIED "Theme-aware workspace panel chrome".

## Impact

One row less chrome; the view tabs sit where the title was.

## Triage

```text
Issue type: UI change (owner request)
Fixture level: expanded
Upstream suggested level: absent; expanded: spec requirement changes, header shared by Files/Browser/Terminal and the Office editor area below it
Blast radius: every workspace panel; a lost accessible name or focus target breaks notice dismissal and many browser specs
Selected risk packs: UI / accessibility
Evidence floor: Vitest for the spec scenarios (red first); make test-frontend; make typecheck; make lint-scoped; make coverage-gate; make anti-drift; make verify-ui-ocu with screenshots (light/dark, wide and 350 px panel, 390 px viewport); make verify-ui; make doc-gate; make decisions-verify
design.md: present
```
