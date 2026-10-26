## 1. Fixture

- [ ] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-workspace-header-tabs --strict --no-interactive`.

## 2. Implement

- [ ] 2.1 Tests first (evidence a–c); record which go red on `main`.
- [ ] 2.2 `WorkspaceArtifact.svelte` header (D1); remove title, count and the separate switch row.
- [ ] 2.3 `WorkspaceViewSwitch.svelte` container query, icon-only labels, tooltips (D2).
- [ ] 2.4 Update only the tests that asserted the removed title, count or row order (D3).
- [ ] 2.5 `npm run i18n:parse` if keys change; decision record; `docs/office-editing.md` if it mentions the title or count.
- [ ] 2.6 Green: `make test-frontend`, `make typecheck`, `make lint-scoped`, `make coverage-gate`, `make anti-drift`, `make verify-ui-ocu`, `make verify-ui`, `make doc-gate`, `make decisions-verify`.

## Risk packs

Selected:

- **UI / accessibility:** names, pressed/disabled, focus target, icon-only labels with tooltips, overflow; 2.2–2.4, evidence a–c.

Not selected:

- **Invariant / state, Security, Migration, Public API:** layout only; no state, route, frame or request change.
