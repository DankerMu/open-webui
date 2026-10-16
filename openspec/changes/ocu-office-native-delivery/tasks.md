# Tasks

## 1. Diagnosis and fixture

- [x] 1.1 Preserve the paired native edit-loss counterexample and qualify the supported delivery event using actual SDK/WebSocket timing, a causal request barrier, published XLSX bytes and an exact old-cell negative control; record the diagnosis without claiming a production fix.
- [x] 1.2 Obtain read-only expanded fixture review and pass `openspec validate ocu-office-native-delivery --strict --no-interactive` before implementation.

## 2. Production ownership

- [x] 2.1 Add host behavioral counterexamples for pending delivery, acknowledgement versus publication, later edits, no-change saves, close-release races and cancellation; parent observes meaningful RED against unchanged production source.
- [x] 2.2 Extend the existing host's save/close/lifetime owner, migrate affected controlled-editor fixtures to distinguish delivered from pending edits, and verify all new cases and the full owning host suite pass without changing message fields, budgets or broker semantics.

## 3. Independent acceptance

- [x] 3.1 Run the owning host/request/preview/package and existing save/close regression inventory with exact discovery/execution reconciliation; verify no skips or weakened outcome assertions and reject a deliberately premature-dispatch/release control.
- [x] 3.2 Materialize an exact composition of the independent #427 host commit and #425 backend candidate; run the real B1 native XLSX input → pre-save4 → normal host save/close → published4 → fresh native4 → coherent fresh close, with no diagnostic request barrier. Capture actual SDK/transport/callback timing, reserved sequence, screenshots, zero unexpected diagnostics and independent cleanup/source preservation.
- [x] 3.3 Run the unchanged document checker against actual published bytes and the isolated old-cell mutant; retain edit, formula, cached-value and chart checks. The mutant must fail for A2=2, not an unrelated missing cache or setup failure.

## 4. Contract and delivery

- [x] 4.1 Reconcile the in-flight editor coverage/close clauses and owning decision, update the OCU changelog, and pass strict fixture plus `make doc-gate` and `make decisions-verify`; preserve paused #172 and #425 files outside the declared companion scope.
- [ ] 4.2 Obtain expanded three-seat source/contract cross-review, adjudicate through the bounded gate, and merge independent #427 production/companion PRs only after their evidence and CI gates pass.
- [ ] 4.3 Record the merged host SHA and acceptance evidence for #425 resumption, then archive this correction after its own acceptance is complete. #425 must finish its separate integration gates before #172's pin changes; #172 retains its full three-format acceptance.

## Risk coverage

| Risk pack                                      | Selection and evidence                                                                                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API / CLI / script entry                | Selected: unchanged nine-key messages, origin/source/generation checks, prefixed/header-bound requests, save/close behavior and publication state. |
| Config / project setup                         | Not selected: no configuration or service setting changes.                                                                                         |
| File IO / path safety / overwrite              | Selected: actual published XLSX retains the native edit and formula/chart content; no new path/storage implementation.                             |
| Schema / columns / units / field names         | Not selected: no persisted schema or public message-field changes.                                                                                 |
| Auth / permissions / secrets                   | Selected as must-preserve: host/request binding and CSP regressions; real evidence is private/redacted.                                            |
| Concurrency / shared state / ordering          | Selected: native delivery, dispatch generation, later edits, accepted-close release and competing command ownership.                               |
| Resource limits / large input / discovery      | Selected: pending waits settle on supersession/error/disposal without multiplied requests or leaked resources; no new quota or large-file claim.   |
| Legacy compatibility / examples                | Selected: no-change saves, automatic persistence, correlated publication, remaining participants and unchanged preview siblings.                   |
| Error handling / rollback / partial outputs    | Selected: pending delivery cannot become false-clean on failure; retain editor until safe release or explicit disposal; no late effects.           |
| Release / packaging / dependency compatibility | Selected: shared host asset delivery and exact composed Git source in the real pinned B1 runtime; no dependency/image replacement.                 |
| Documentation / migration notes                | Selected: host contract/decision/changelog, strict fixture and doc/decision gates.                                                                 |

## Owning evidence inventory

Canonical OCU command: `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest <owning files> -q --import-mode=importlib --ignore=tests/integration` with Python3.12 and Node22.

Initial owning files: `tests/orchestrator/test_office_editor.py`, `test_office_router.py`, `test_preview_prefix.py`, `test_server_package.py`, and `test_office_save_close.py`. Record any directly affected consumer additions before execution. Preserve #425's backend test evidence by exact source/test identity when unchanged; rerun affected cases after integration if those identities change.

The parent owns checks and independent real acceptance. Implementer/reviewer leaves run no tests/build/lint/format/services mid-flight. Fixtures and temporary oracle controls are not production acceptance; all production qualification must run without the diagnostic delivery barrier. The parent retains the paired failure, pinned API quote, native trace and old-cell negative control outside candidate write authority.
