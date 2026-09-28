# Tasks

## 1. Selected runtime contract

- [ ] 1.1 Extend existing mode tests and real browser recording harness to fail on unsupported Browser/Terminal embedding and missing CSP before source edits; parent observes semantic RED, candidate skips all execution.
- [ ] 1.2 Implement selected-only runtime mount using existing clients and lifecycle helpers; prove valid/invalid modes, prefix correctness, zero-output access, error states and no implicit launch with focused tests and actual browser.
- [ ] 1.3 Bind runtime CSP to shell nonce and verify browser-permitted local initialization, actual same-origin WebSocket and rejection of external script/network attempts; update owning decision/interface docs.

## 2. Lifecycle and compatibility

- [ ] 2.1 Prove20actual mount/remove cycles and delayed status/connect completion leave zero active owned connections and no retained timers/reconnect work; fix canonical client lifecycle where needed, not symptom suppression.
- [ ] 2.2 Parent runs existing preview/embedding and focused API suites plus full OCU orchestrator regressions; qualify lifecycle/policy oracles with semantic fault and restored GREEN in disposable explicit-path exports. Preserve Files-only Office/standalone behavior and screenshots.

## 3. Integration delivery

- [ ] 3.1 Validate fixture and decision/docs gates, obtain independent lifecycle/trust and integration/evidence reviews, run exact-head source/control CI and merge paired PRs; update issue30 dependency and reviewed pin handoff. No Docker proof claimed.

Risk mapping: lifecycle/order→1.2/2.1/2.2; trust→1.3; compatibility→2.2; integration→1.1/2.2/3.1. Parent owns all tests, probes, runtime, lint, format and build; agents edit only declared source/tests and cannot self-certify acceptance.
