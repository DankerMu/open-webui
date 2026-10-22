## 1. Fixture

- [x] 1.1 Compact fixture, read-only fixture review, `openspec validate ocu-office-status-label-wrap --strict --no-interactive`.

## 2. Implement

- [x] 2.1 Write the test first, in `src/lib/components/chat/OfficeEditorStatus.test.ts`. Render with `state: 'conflict'`, `workspaceChanged: true`, `live: true`, then assert:
  - the `[data-office-status]` row has the class `[word-break:normal]`;
  - the status paragraph (the `role="status"` element with text `Conflict`) has `min-w-0`, `flex-auto` and `break-words`, and does not have `flex-1`.

  It must fail on current `main`.

- [x] 2.2 `OfficeEditorStatus.svelte`: change the row `<div>` (`:76`) to add `[word-break:normal]`, and the status `<p>` (`:79`) from `min-w-0 flex-1` to `min-w-0 flex-auto break-words`. No other markup changes.
- [x] 2.3 Real-browser layout check, mandatory. No existing e2e case reaches `conflict` with `workspaceChanged` in the side panel: the conflict case at `e2e/ocu-office.e2e.ts:443` runs at 390×844 (Drawer) and maximizes first. Build a scratch page or route; nothing is committed unless it is cheap and deterministic. The page must load the app's real global stylesheet `src/app.css`, including `html { word-break: break-word }`. A page with only Tailwind utilities would not reproduce the bug.
  - **Setup:** a viewport at least 1024px wide, so the resizable side panel is used, not the Drawer (`ChatControls.svelte:341`). The status bar is 350px wide, the panel's default and minimum (`ChatControls.svelte:76`, `:479`); clear any saved `chatControlsSize`, or size a container to 350px. The bar shows `Conflict`, "Workspace file changed" and the Save, Version history, Maximize and Close editor buttons.
  - **Before the fix:** the status paragraph's height is more than one line (letters stacked).
  - **After the fix:** it is one line tall, `Conflict` is whole on that line, and the bar wraps its controls onto further lines.
  - **Long token:** a status `Failed: <60-character token with no spaces>` stays inside the bar after the fix, with `scrollWidth <= clientWidth` on the bar.
  - **Evidence:** before and after screenshots under `.run/ui-evidence/`, plus the measured heights and widths.
- [x] 2.4 Green: `make test-frontend` (or the `OfficeEditorStatus.test.ts` file alone, plus the full frontend suite once), `make typecheck`, `make lint-scoped`.

## 3. Verify

- [x] 3.1 Hosted CI green on the PR.

## Risk packs

Selected:

- UI layout: the inherited `word-break: break-word` and the status paragraph's flex sizing inside a wrapping row (2.1 for the classes, 2.3 for the real layout with `src/app.css` at 350px, including the long-token case).

Not selected:

- Auth, concurrency, schema, config, file IO, compatibility: class changes in one component only.
- Documentation: user-visible behaviour is unchanged apart from the layout; `docs/office-editing.md` does not describe the status bar's wrapping.
