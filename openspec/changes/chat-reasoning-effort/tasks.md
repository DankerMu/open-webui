## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review, `openspec validate chat-reasoning-effort --strict --no-interactive`.

## 2. Implement

- [x] 2.1 Tests first (design evidence a–d); record which go red on `main`.
- [x] 2.2 `src/lib/utils/reasoning-effort.ts` + `reasoning-effort.test.ts` (D1: family rules, generic, helpers).
- [x] 2.3 `src/lib/stores/chat-effort.ts`; `ChatControls.svelte` publishes the binding (D2) + test.
- [x] 2.4 `ReasoningEffortSelector.svelte` + required `ReasoningEffortSelector.test.ts` (D3); placement in `ModelSelector.svelte`, `MessageInput.svelte` class-only (D4).
- [x] 2.5 Browser case with request interception and screenshots (evidence d).
- [x] 2.6 `npm run i18n:parse`; decision record per `docs/decisions/README.md`; user doc note if a user guide covers model selection.
- [x] 2.7 Green: `make test-frontend`, `make typecheck`, `make lint-scoped`, `make coverage-gate` (naming the new files), `make anti-drift`, `make verify-ui-ocu` / `make verify-ui`, `make doc-gate`, `make decisions-verify`.

## Risk packs

Selected:

- **Invariant / state:** single params source, default application without loops, model, multi-model and chat switches never leaving an unsupported key; 2.2–2.4, evidence a–c.
- **Public API:** exact request keys per choice, nulls cancel inherited settings; 2.2, evidence a, d.
- **UI / accessibility:** placement, radio items, narrow layout, screenshots; 2.4, 2.5, evidence b, d.

Not selected:

- **Security / authorization:** no route, permission or sandbox change.
- **Migration:** none (params are free-form chat JSON).
