## 1. Fixture

- [ ] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-workspace-notice-lifetime --strict --no-interactive`.

## 2. Implement

- [ ] 2.1 Tests first (design evidence plan a–f) in `src/lib/components/chat/workspace-reconciliation.test.ts` and a component test for the dismiss button; record which go red on `main`.
- [ ] 2.2 Store: the `noticeClearsOnListing` flag beside `notice` (D2), written only through `setWorkspacePresentation` (every write of `notice` sets it, default false).
- [ ] 2.3 Controller: `run()` clears only for non-poll modes (D1); the two success write points clear a flagged notice (D2); `selectFile` clears (D3).
- [ ] 2.4 `WorkspaceArtifact.svelte`: the view change clears the store notice (D3); the icon-only `Dismiss notice` button in the banner (D4); `npm run i18n:parse` for the new key; re-check `WorkspaceArtifact.office-preflight-lifecycle.test.ts:227`, `:260`.
- [ ] 2.5 Update the B-T13 removal comment in `e2e/ocu-office-leave-fixtures.ts:725-726` if it still says the next run clears the notice; keep the hold.
- [ ] 2.6 Green: `make test-frontend`, `make typecheck`, `make lint-scoped`, `make verify-ui-ocu`, `make verify-ui`; screenshot of the banner with the dismiss button under `.run/ui-evidence/`.

## Risk packs

Selected:

- **Invariant / state:** notice and flag written together, generation guard, 2.2, 2.3, evidence a, c, d, f.
- **Error handling:** failure notices cleared only by a completed successful run, evidence c.
- **UI / accessibility:** icon-only dismiss button inside the alert banner, its own accessible name, focus moves to Refresh after dismissal, evidence e and verify-ui.

Not selected:

- **Concurrency:** the controller already serializes runs; no new async path.
- **Security / authorization:** client-only, no request.
- **Migration / Public API:** none.
