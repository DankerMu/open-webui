## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-workspace-nav-entry --strict --no-interactive`.

## 2. Implement

- [ ] 2.1 Tests first (design evidence a–c); record which go red on `main`.
- [ ] 2.2 Store `ocuWorkspaceEntry` (D1).
- [ ] 2.3 `WorkspaceNavButton.svelte` + required `WorkspaceNavButton.test.ts` (D2); navbar placement (D3).
- [ ] 2.4 `ChatControls.svelte`: publish the store, remove the card and header text buttons (D4); update only assertions that relied on the removed elements or on the entry being absent while shown: `e2e/ocu-office-fixtures.ts:20-29` (panel first, then entry), `e2e/ocu-office-fixtures.ts:283` (`section[aria-label="Workspace Files"]`), `e2e/ocu-tree.e2e.ts:47-59` (drop the Controls pre-click), `e2e/ocu-controls.e2e.ts:561-590` (alignment; toggle on desktop; mobile closes the drawer, opens via the entry, closes via `Close workspace`), `ChatControls.test.ts:229-247`.
- [ ] 2.5 `npm run i18n:parse` if keys change; decision record per `docs/decisions/README.md`; check `docs/office-editing.md` and other user docs that describe opening the workspace.
- [ ] 2.6 Green: `make test-frontend`, `make typecheck`, `make lint-scoped`, `make coverage-gate` (naming `WorkspaceNavButton.svelte`), `make anti-drift`, `make verify-ui-ocu`, `make verify-ui`, `make doc-gate`, `make decisions-verify`. Screenshots: navbar closed and open, light and dark.

## Risk packs

Selected:

- **UI / accessibility:** single named entry, pressed state, hidden statuses, alignment; 2.3, evidence a, c, d.
- **Invariant / state:** store follows availability and unmount, no stale toggle across chats; 2.2, 2.4, evidence b.
- **Office edit safety:** close through `closeWorkspace` guard; 2.4, evidence b.

Not selected:

- **Security / authorization:** no route, iframe or sandbox change.
- **Migration / Public API:** none.
