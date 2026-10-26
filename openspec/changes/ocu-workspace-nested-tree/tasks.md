## 1. Fixture

- [ ] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-workspace-nested-tree --strict --no-interactive`.

## 2. Implement

- [ ] 2.1 Tests first (design evidence a–e); record which go red on `main`.
- [ ] 2.2 `workspace-file-rows.ts`: the D1 row model and `hiddenByCollapse` (D2).
- [ ] 2.3 `WorkspaceFileTree.svelte` with the required paired `WorkspaceFileTree.test.ts` (D3, D4); `FILE_KIND_ICONS` exported from its module script; `WorkspaceArtifact.svelte` uses it, drops `fileFolder`, derives `selectedDirectory` from `parent`.
- [ ] 2.4 Update only the assertions the new shape changes, keep every other one:
  - `WorkspaceArtifact.tree.test.ts:165-176` (folder label order gains `Folder packages`, `Folder packages/core`), `:180-182`, `:201-202` (`pl-7` → depth indentation), size assertions on non-too_large rows;
  - `e2e/ocu-tree.e2e.ts:89`, `:166` (intermediate folder `Folder packages/core`), `:103` (`> li` count 32 → 34 with `scripts/ocu_stub_nested.py`), folder selectors with `exact: true` because folder labels are now prefixes of each other;
  - `workspace-file-rows.test.ts` row shapes.
  - Must stay green unchanged: `WorkspaceArtifact.too-large.test.ts:96`, `e2e/ocu-workspace.e2e.ts:679`, the glyph-update and TSV cases, `e2e/ocu-tree.e2e.ts:128`, `:222`.
- [ ] 2.5 `npm run i18n:parse` if any key changes; decision record per `docs/decisions/README.md`.
- [ ] 2.6 Green: `make test-frontend`, `make typecheck`, `make lint-scoped`, `make coverage-gate` (naming `workspace-file-rows.ts`, `WorkspaceFileTree.svelte`), `make verify-ui-ocu`, `make verify-ui`, `make doc-gate`, `make decisions-verify`; light/dark tree screenshots under `.run/ui-evidence/`.

## Risk packs

Selected:

- **UI / accessibility:** accessible names, keyboard focus, theme, screenshots; 2.3, 2.4, evidence c, d.
- **Invariant / state:** ordering, identity and keys, collapse by ancestry; 2.2, evidence a, b.

Not selected:

- **Security / authorization:** display only; iframe attributes untouched.
- **Concurrency / Migration / Public API:** none.
