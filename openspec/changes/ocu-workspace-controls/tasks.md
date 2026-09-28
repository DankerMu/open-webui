# Tasks

## 1. Saveable entry and panel policy

- [ ] 1.1 Add behavior-level regression for unsaved workspace activation before source changes; parent observes RED in actual UI, then implement minimal upstream callback/adoption/single-flight coordination and verify both Workspace-first and Send-first ordering, first-message title/tags after pre-save, failure, temporary and navigation cases.
- [ ] 1.2 Extend existing chat-keyed state and ChatControls lifecycle for reachable action, close latch, acknowledged revision/change indicator and accepted-first-output policy; real mounted component/store tests prove A/B isolation and no reopen after close without adding a second reconciliation producer.

## 2. Runtime views and compatibility

- [ ] 2.1 Consume reviewed OCU013e77e pin, add capability-gated runtime tabs with fixed current-chat URLs/sandbox, preserve file selection and ordered view/open prefs; verify empty/stopped/Launch, immutable frame identity and teardown.
- [ ] 2.2 Localize workspace strings using existing context/keys and parent-run i18n parser; retain paired tests and native Artifact/Embeds/Call coexistence with no unsupported upstream edits.
- [ ] 2.3 Extend actual proxy/stub evidence for A-T07/A-T12/A-T15/A-T02/A-T13, including actual recording sockets and20open/close cycles; retain A-T01/A-T10 and add positive cookie control. Real A-T05/A-T09 remain issue36.

## 3. Integrated assurance

- [ ] 3.1 Parent runs make test-frontend, typecheck, lint-scoped, coverage-gate, smoke, smoke-proxy and full verify-ui; qualifies new save/close/cross-chat oracles with semantic mutants and restoration; records screenshots and stops owned services.
- [ ] 3.2 Update decision/interface documentation, run strict OpenSpec and docs gates, obtain correctness/test-evidence+spec/integration review seats, then exact-head CI and merge/archive; feature remains off by default and issue32 producers remain separate.

Risk mapping: persistence/order→1.1/1.2; trust/runtimeownership→2.1/2.3; compatibility/localization→2.2; actualintegration/oracles→3.1; sourceboundary/delivery→3.2. Leaves skip all validation/runtime/build/lint/format; parent owns execution. No new dependencies, Docker or host network mutations.
