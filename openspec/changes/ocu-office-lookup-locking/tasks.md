# Tasks

## 1. Contract and regression boundary

- [x] 1.1 Review this expanded fixture and run `openspec validate ocu-office-lookup-locking --strict --no-interactive`; explicitly bind the changed lock/worker contract to issue #425 and preserve the existing Office status-1 remaining-participant behavior.
- [x] 1.2 Add behavioral regressions at the existing real command/HTTP/callback seams and observe RED before source repair: callback acknowledgement must progress during lookup, close must retain its reserved sequence, and all four caller surfaces must avoid callback-worker and canonical-lock starvation.

## 2. Production correction

- [x] 2.1 Refactor join/reopen, close, sweep and history restore to locked prepare/unlocked lookup/locked revalidation; verify known, unknown and unreachable outcomes, duplicate-close reuse and all controlled concurrent-authority cases in the owning tests.
- [x] 2.2 Reuse one lifespan-owned transaction execution mechanism for callback-bearing waits and migrate all consumers if names change; verify DNS/callback capacity independence, queued/running cancellation, context isolation, teardown drain and packaged startup without aliases or fallback pools.

## 3. Independent qualification and delivery

- [x] 3.1 Run the affected OCU regression inventory with the canonical unit command and record exact discovered/executed results; retain the original callback/save/publication/restore/auth outcomes and prove wrong stale-result application fails the new assertions.
- [x] 3.2 Run parent-owned real HTTP plus B1-image close evidence on an exact candidate snapshot: callback acknowledgement precedes command completion without the ten-second lock cycle, DOCX final handling consumes the reserved close sequence, and fresh-XLSX broker and host reach a coherent terminal state; independently verify owned-resource cleanup and unrelated resource preservation.
- [ ] 3.3 Update the command ownership decision and live capability purpose, partially superseding only unsafe lock-across-lookup and worker-domain clauses; update the OCU changelog, run WebUI doc/decision/strict gates, obtain high-risk source cross-review and merge separate production/companion PRs.
- [ ] 3.4 Resume #172 with the exact merged OCU pin; require its complete real three-format target and retained `make smoke-proxy` / `make verify-ui-ocu` cases before claiming that verifier complete. Archive this correction only after its own acceptance evidence is complete; keep the larger Office change open.

The native-delivery prerequisite is accepted in [issue #427](https://github.com/DankerMu/open-webui/issues/427#issuecomment-6206102665). Its merged host and this lookup candidate are production-byte-identical to the qualified XLSX composition. A fresh DOCX native-edit close completes lookup in 9.191 ms with the induced callback acknowledged before its response and final status 2 consuming reserved sequence 1. The separate #172 content checker rejects the preserved DOCX image inside `mc:AlternateContent`; retain that verifier counterexample without treating this close proof as full three-format or document-fidelity acceptance.

## Risk coverage and owning inventory

| Risk pack / selection                                     | Required evidence or non-goal                                                                                                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API / CLI / script entry — selected                | Existing create/join, close, status and restore responses for known/unknown/unreachable keys; malformed/refused requests retain precedence and no unexpected sequence allocation. |
| Config / project setup — selected                         | Service-lifetime execution wiring and actual packaged startup; no environment setting added.                                                                                      |
| File IO / path safety / overwrite — selected              | File identity/version change and accepted recovery during lookup cannot redirect responsibility or alter unrelated bytes; restore rechecks its original path/version admission.   |
| Schema / columns / units / field names — not selected     | No persisted schema or migration; transient executor names migrate atomically if generalized.                                                                                     |
| Auth / permissions / secrets — selected                   | Existing router/control-plane/auth regressions retain token and chat binding; runtime artifacts are private/redacted, no credentials in public proof.                             |
| Concurrency / shared state / ordering — selected          | Induced callback progress, legitimate later status 1, terminal callback, duplicate close, session/key/epoch replacement and a newer save at controlled barriers.                  |
| Resource limits / large input / discovery — selected      | One callback slot and one DNS worker; unchanged command budget, cancellation/startup/teardown ownership. No new quota or large-document capacity claim.                           |
| Legacy compatibility / examples — selected                | Preserve caller-specific outcomes and all active consumers; full #172 pin/smoke/UI handoff remains separate. No compatibility aliases.                                            |
| Error handling / rollback / partial outputs — selected    | Pending save/close responsibility, immutable versions, receipts, journals and publication obligations survive overlap; no speculative orphaning or clearing a newer save.         |
| Release / packaging / dependency compatibility — selected | Package inventory, actual B1 broker/host close and independent cleanup inventories. No dependency/image replacement.                                                              |
| Documentation / migration notes — selected                | Full command contract delta, decision supersession, OCU changelog, strict fixture validation, `make doc-gate` and `make decisions-verify`.                                        |

Use OCU's canonical command:

`uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest <owning files> -q --import-mode=importlib --ignore=tests/integration`

The initial owning inventory is `tests/orchestrator/test_office_session_lifecycle.py`, `test_office_save_close.py`, `test_office_sweep.py`, `test_office_restore.py`, `test_office_command_deadline.py`, `test_office_commands.py`, `test_office_save_workers.py` (or its cleanly renamed successor), `test_office_callback_processing.py`, `test_office_callback_publish.py`, `test_office_publish_recovery.py`, `test_office_resolution.py`, `test_office_control_plane_concurrency.py`, `test_office_control_plane.py`, `test_office_router.py`, `test_lifecycle_lock.py`, `test_server_package.py` and `tests/test_auth_guard.py`. Add directly affected fixture/lifespan consumers found by reference migration; record them explicitly before execution. Use the pinned Python 3.12 runtime and existing dependency versions.

The parent owns final tests, format/lint, runtime probes and evidence publication. Implementation/review leaves run no checks mid-flight. Permanent regressions assert observable progress/state/authority, not source text or copied wiring. Protected real traces and deliberately wrong-result controls remain outside candidate write scope. No CI success, LAN acceptance or full #172 acceptance follows from the owning unit count.
