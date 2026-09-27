# Tasks

## 1. Files consumer

- [ ] 1.1 Add the real component and paired jsdom/Svelte tests, extend existing OCU API/store seams and minimal authenticated flag/mount hooks; prove off/invalid-chat no requests and chat-generation retirement.
- [ ] 1.2 Implement state/actions, coherent pagination, identity selection and explicit tombstone prefs clearing; tests prove errors are not empty, stopped browsing, permitted launch, later-page identity and no partial-list deletion.
- [ ] 1.3 Integrate generated opaque iframe and real restricted Office parent protocol; component tests prove source/origin/schema/generation rejection and parent download fallback, never user-widened sandbox.

## 2. Actual browser evidence

- [ ] 2.1 Extend existing proxy/stub lifecycle with actual SPA origin and real-chat fixtures; use reviewed OCU Git pin and real Office assets, no ignored-file copies or production fixture route; preserve existing proxy smoke.
- [ ] 2.2 Add A-T01/A-T10 Playwright cases on actual mounted WebUI: three generated-document open paths, scripted SVG, inline resources, blocked storage, expected relative401, empty/large/corrupt/unreachable/deleted states; screenshots and zero unexpected console errors.
- [ ] 2.3 Parent runs make test-frontend, typecheck, lint-scoped, coverage-gate, smoke, smoke-proxy and verify-ui plus semantic-fault qualification; approved jsdom dependency installed with consistent lockfile, no threshold exemptions. Stop owned services.

## 3. Delivery

- [ ] 3.1 Update decision/interface/harness instructions and CI test wiring, validate OpenSpec and docs gates, cross-review, exact-head CI, merge and archive. Browser/Terminal/full workspace controls remain issue30; history/event interception remains issue32; real Docker acceptance remains issue36.

## Risk mapping

Trust:1.3/2.2; ordering/lifecycle:1.1–1.3; errors/pagination:1.2; integration:2.1/2.2; upstream/flag compatibility:1.1; verification/dependency:2.3; docs:3.1. Implementation leaves skip execution; parent owns all commands.
