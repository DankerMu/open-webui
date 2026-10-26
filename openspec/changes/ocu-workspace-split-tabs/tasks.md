## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-workspace-split-tabs --strict --no-interactive`.

## 2. Implement

- [x] 2.1 Tests first (design evidence a–g); record which go red on `main`.
- [x] 2.2 `workspace-tabs.ts` + `workspace-tabs.test.ts` (D1).
- [x] 2.3 Controller `clearSelection` + test (D3).
- [x] 2.4 `WorkspaceTreeSplitter.svelte` + required test (D7); `WorkspaceViewSwitch.svelte` + required test (D6); `WorkspaceSelectedFile` container-width rule (D8).
- [x] 2.5 `WorkspaceFileTabs.svelte` + required `WorkspaceFileTabs.test.ts` (D5).
- [x] 2.6 `WorkspaceArtifact.svelte`: `applySelection` + guarded `selectFile`/`closeTab` (D2), tab state and reactive rules (D1), layout without tree remount (D4), uses `WorkspaceViewSwitch`; stays under 800 lines.
- [x] 2.7 Update only assertions that relied on the cap or the stacked layout, keep every other one:
  - `WorkspaceArtifact.tree.test.ts:665-674` (two-fifths cap case) → full-height tree column;
  - `e2e/ocu-tree.e2e.ts:151` (`ratio <= 0.42`) → tree column spans the area height; `:124` stays; `:206-223` row-visibility loop now runs in a narrow column (scroll rows into view if needed);
  - `selectedPreviewFit` overflow check (`e2e/ocu-tree.e2e.ts:77`) must pass in the 200 px column (D8);
  - narrow-viewport cases `e2e/ocu-controls.e2e.ts:565`, `e2e/ocu-office.e2e.ts:391`, `:449` must stay green;
  - Office leave-guard browser cases stay green unchanged.
- [x] 2.8 `npm run i18n:parse` for new keys (`Open files`, `Close tab`, `Hide file tree`, `Show file tree`, `Resize file tree`, `No file selected`); decision record per `docs/decisions/README.md`; `docs/office-editing.md` lines 3 and 11.
- [ ] 2.9 Green: `make test-frontend`, `make typecheck`, `make lint-scoped`, `make coverage-gate` (naming `workspace-tabs.ts`, `WorkspaceFileTabs.svelte`, `WorkspaceTreeSplitter.svelte`, `WorkspaceViewSwitch.svelte`), `make anti-drift`, `make verify-ui-ocu`, `make verify-ui`, `make doc-gate`, `make decisions-verify`; `make verify-office` if the pinned DocumentServer is available, else say so. Screenshots: tree-only, split with two tabs, tree hidden, Browser full width, light and dark.

## Risk packs

Selected:

- **Office edit safety:** guard ordering for switch and close, cancelled departure keeps state; 2.6, evidence e.
- **Invariant / state:** tabs vs selection vs prefs, prune, restored selection; 2.2, 2.3, 2.6, evidence a, b, d.
- **UI / accessibility:** tablist roles, names without file names on buttons, separator, toggle, screenshots; 2.4, 2.5, evidence c, f, g.

Not selected:

- **Security / authorization:** iframe attributes and routes untouched; prefs endpoint unchanged.
- **Migration / Public API:** none (backend already accepts `selected_file_id: null`).
