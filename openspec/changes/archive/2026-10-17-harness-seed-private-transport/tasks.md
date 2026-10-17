# Tasks

## 1. Private transport cutover

- [x] 1.1 Add the backend-discovered seed transport regression and `make test-harness-seed`; parent records a semantic RED from actual seed/smoke child argv without printing synthetic credentials.
- [x] 1.2 Refactor the shared seed owner in place, add the thin smoke runner and cut over Make; verify matching effective credentials, signin/signup/idempotence,0600/0700 inputs and no password in any transport/helper argv.

## 2. Lifetime and acceptance

- [x] 2.1 Exercise success, nonzero child exit, missing executable and SIGINT/SIGTERM/SIGHUP for seed and Hurl; verify owned child retirement, file/scratch removal and unrelated sentinels. Qualify residue detection with a controlled failing cleanup boundary rather than a source-text assertion.
- [x] 2.2 Run real `make smoke` with distinctive synthetic credentials in owned harness data, observe actual curl/Hurl argv and successful HTTP authentication, and verify real Hurl report redaction against the exposing variables-file control; retire only owned services/data.
- [x] 2.3 Update the Hurl transport note and testing decision, run focused/Office transport regression, scoped lint and doc/decision gates, complete expanded review and exact-head CI, then merge and archive this fixture.

## Risk coverage

- Script entry/config/compatibility — selected: standalone seed plus Make smoke/default/environment/command-line precedence, existing empty fallback and signin-first behavior; shared e2e/UI seed invocation stays intact.
- Secrets/file IO — selected: actual argv observations, effective request data,0600files under fresh0700scratch, real Hurl redaction and no plaintext diagnostic assertions.
- Resource lifetime/error handling — selected: active child ownership, failure/launch/interruption matrix and residue negative control; cleanup cannot affect unrelated resources or mask failure.
- Documentation — selected: private transport ownership and SIGKILL/environment exclusions; existing Office/resource policy remains separate.
- Schema, production auth, release/dependencies and performance — no changed behavior or dependency version; no new retry/fallback policy.

Evidence: `docs/evidence/issue-375/verification.json.gz` records the confidential semantic RED,19 passing focused cases,38 adjacent Office/resource cases, scoped lint, doc/decision gates, real smoke11requests, independent signin, Make CLI precedence and resource retirement. The Hurl8.0.1 control sent identical values through both file modes: variables-file reports exposed the synthetic value; secrets-file reports did not. A cleanup-noop receiver made the owner exit1 and the residue oracle reject; normal cleanup exited0 and passed. The first real smoke passed but its oracle incorrectly included unrelated Node/uv/Torch caches in seed scratch; the corrected isolated lifecycle-TMPDIR run passed without production edits.

Delivery: feature PR453 merged at `19e6c2bcd8eedeac1dd58db05677e803bb8f10e7`, reviewed head `9abfed584cac61b347c018ecb9858fc167bc4c49`. Three-seat R1 found no P0/P1; standalone smoke cwd P2 is tracked in #454. Exact-head local scoped CI evidence: https://github.com/DankerMu/open-webui/pull/453#issuecomment-6230864974. No hosted Ubuntu/full-suite claim. This archive retains the historical verification record above; independent review and CI are complete.
