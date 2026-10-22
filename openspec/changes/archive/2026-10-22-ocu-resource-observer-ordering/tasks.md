## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-resource-observer-ordering --strict --no-interactive`.

## 2. Implement

- [x] 2.1 Tests first. Start by extracting today's merge logic into `e2e/ocu-wire-rows.ts` with no change in behaviour, and verify the extraction with the in-order control (a4). Show (a1)–(a3) red against that extraction before applying the fix; a red that only means "module missing" does not count. `e2e/ocu-wire-rows.test.ts` for design.md evidence (a1)–(a5), (b) and the (b2) counter, with the vitest `include` extended to `e2e/**/*.test.ts`. Record red on `main` for (a1), (a2) and (a3). (a5) is a guard and is green on `main`. Show it going red against an implementation without the redirect reset.
- [x] 2.2 Implement `e2e/ocu-wire-rows.ts`: the merge rules, the redirect reset, the buffer, the counter and the formatter. Wire `ResourceObserver` to it, for both the `attach()` path and the popup `onNetwork` path. `refused()` writes `wire-rows.json` before it throws, and every test prints the redacted `wire-buffer-hits` stdout line. `redactOcu` moves into the new module.
- [x] 2.3 Write `backend/open_webui/test/test_verify_ui_ocu_evidence.py` first, covering (c2), the copy set and the absence of `trace.zip`. Then implement the best-effort copies in the `verify-ui-ocu.py` failure branch.
- [x] 2.4 Make the `ci.yml` upload path changes per design.md. In the PR, flag them as a CI change.
- [x] 2.5 Run evidence (b2) and (c), covering the forced OCU `refused()` failure and the forced baseline failure. Revert both forcing edits afterwards. Record the retained file list, the secret grep and the grant-segment grep.
- [x] 2.6 Add the decision record in `docs/decisions/implemented/testing/`, following `docs/decisions/README.md`. Traces are excluded from CI artifacts; screenshots and redacted text are admitted. Trace retention with body redaction goes under `## Alternatives considered`. Note that the baseline `error-context.md` is uploaded unredacted, because it only holds the seeded harness identities and no OCU grants. `make decisions-verify` must pass.
- [x] 2.7 Green:
  - `make test-frontend`, which now includes `e2e/ocu-wire-rows.test.ts`;
  - `make test-backend`, or the single new module plus the backend suite once;
  - `make lint-scoped`;
  - `make coverage-gate` (it excludes `e2e/**`, `scripts/coverage-gate.sh:15,52`; the new module's coverage comes from its paired vitest test);
  - `make verify-ui-ocu-repeat SPEC=ocu-resources.e2e.ts REPEAT=10 GREP="A-T01"`;
  - `make verify-ui-ocu`;
  - `make doc-gate`.

## 3. Verify

- [x] 3.1 Hosted CI on the PR is green twice for `Runtime verification`: the first run and a `gh run rerun`. `All checks passed` is green.

## Risk packs

Selected:

- **Concurrency / ordering:** the arrival order of CDP events, and redirect hops (2.1, 2.2, evidence (a1)–(a5)).
- **Auth / secrets:** the retained evidence is redacted against `self.secrets` and grant segments, and no trace is kept (2.3, 2.5, evidence (c), decision record).
- **Error handling / partial outputs:** the best-effort copy in the `except … raise` branch keeps the original failure (2.3, evidence (c2)).
- **File IO / path safety:** the copy destinations are built only from the scratch listing, under `.run/ui-evidence/<scratch>/test-results/<case>/`, and `trace.zip` is never copied (2.3, evidence (c), (c2)).
- **Config / project setup:** the `ci.yml` upload paths and the `vite.config.ts` test include (2.4, 2.1; checked by the forced failure (c) and by `make test-frontend` discovering the new test).
- **Public API / CLI / script entry:** the observable behaviour of `verify-ui-ocu.py` on failure. The exit status and the re-raised exception are unchanged (evidence (c2)).
- **Documentation:** the decision record (2.6).

Not selected:

- **Schema / persistence, product code, upstream compatibility:** this change touches only the test harness, CI and the vitest config. No runtime behaviour changes.
- **Performance:** the per-event buffer is bounded by the requests seen in one test, and it is cleared on dispose.
