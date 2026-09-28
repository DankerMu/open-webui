# Tasks

## 1. Single data producer

- [ ] 1.1 Add an actual browser missing-event/polling counterexample before source changes; parent records semantic RED. Establish deterministic controller tests for current/background hints,3s/15s visibility, in-flight hint retention, cancellation and out-of-order data.
- [ ] 1.2 Extract the existing coherent data reconciler into one Chat-owned controller and migrate WorkspaceArtifact commands/state without duplicate implementations. Parent proves existing component behaviors, conditional304, coherent paging, no implicit Launch and close/switch resource ownership.

## 2. Restore and delegated selection

- [ ] 2.1 Consume nested prefs once, migrate the minimal ChatControls preference-write hook to hydration-aware ordered patches, and preserve newer local intent. Tests delay describe across open/close/selection, prove restart restoration and no partial-list deletion.
- [ ] 2.2 Add early Chat hint/reconnect hooks and one delegated link handler using absolute-base recognition and coherent path→file_id lookup. Test foreign/other-chat/download/archive/modified gestures, not-yet-loaded pages and navigation during selection; preserve actual generated/Office isolation and changed path+revision refresh.

## 3. Actual integration and delivery

- [ ] 3.1 Extend native harness with owned backend/stub restart preserving persisted state and recorded process identity; actual A-T06 restore and A-T11 server-hint/no-event output cases must render with zero unexpected console errors and no launch call. Real Docker/OCU sandbox restart remains final issue36 by user instruction, not claimed here.
- [ ] 3.2 Parent runs make test-frontend, typecheck, lint-scoped, coverage-gate, smoke, smoke-proxy and full verify-ui; qualifies event placement/stale-data/late-pref/link oracles with disposable semantic mutants and restoration; inspects screenshots, stops services and removes scratch exports. No concurrent SvelteKit generators during UI verification.
- [ ] 3.3 Update owning decision/interface documentation and generated locale catalogs through the parser when needed; strict OpenSpec/docs gates, correctness/test-evidence+spec/invariant-state review, exact-head CI and gated merge/archive. Document atomic-cutover diff justification without relaxing gates.

Risk mapping: concurrency/identity→1.1/1.2/2.2; persistence/API compatibility→1.2/2.1; lifecycle/trust→1.2/2.2/3.1; UI/oracle integrity→3.1/3.2; delivery→3.3. Leaves skip ALL validation/build/lint/format/runtime commands; parent owns execution. No new dependencies, backend/OCU product change, Docker or host-network mutation.
