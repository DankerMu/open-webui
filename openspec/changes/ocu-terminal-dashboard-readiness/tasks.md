## 1. Bounded correction

- [x] 1.1 Independent compact fixture review and strict validation pass; confirm the current post-upload ordering and existing standalone readiness pattern.
- [x] 1.2 Add only the dashboard action wait after status-request observation and before the existing exact button/card checks; verify production files, assertions and timeouts are unchanged.

## 2. Verification and delivery

- [x] 2.1 Run the real Chromium preview harness; require its final success footer, existing exact post-refresh controls and zero unexpected console/page/network errors. Report the static risk without claiming a reproduced flake.
- [ ] 2.2 Run central docs/decision/changed-format/strict-fixture checks; compact correctness+test-evidence review and exact-head local CI close cleanly.
- [ ] 2.3 Merge paired source/fixture, close the issue and archive the test-only fixture without changing canonical production specs.

## Risk packs

Selected: async ordering — wait for rendered action rather than request arrival (1.2,2.1); legacy compatibility — exact count/card/request/error checks unchanged (1.2,2.1); documentation — test-only fixture and truthful evidence (2.2).

Not selected: public production API, auth, file IO, persisted state, resource limits, schema, config, dependencies, release — no such changes. No new production behavior, sleeps, retry loop, timeout increase, relaxed assertion or additional card-absence test. Parent applies the mechanical one-line change inline; independent fixture/code reviews remain required.
