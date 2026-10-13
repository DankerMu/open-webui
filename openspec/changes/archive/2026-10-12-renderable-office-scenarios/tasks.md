# Tasks

## 1. Contract and baseline

- [x] 1.1 Obtain independent expanded fixture PASS and strict OpenSpec validation before source changes.
- [x] 1.2 Freeze affected inputs and parent-owned expectations; run a real HTTP tracer with the existing valid DOCX input and record semantic RED for invalid specialized workspace bytes, with a valid ordinary-DOCX control.

## 2. Renderable version cutover

- [x] 2.1 Implement the minimal configured seed correction and shared deterministic valid input where needed; show the unchanged parent tracer GREEN and retain one DOCX generator, no new configuration or production frontend changes.
- [x] 2.2 Add consumer-visible regression coverage for both configured scenarios: distinct valid workspace/autosave bytes, independently matching hash/size metadata, deterministic content, unchanged version identity/flags; qualify same-bytes and wrong-metadata controls through disposable fixtures.
- [x] 2.3 Prove unpublished restore/history/revision and stale first409/retirement/retry/new-identity behavior over real HTTP; compare unconfigured bytes and lifecycle observations against the frozen baseline and run existing `make smoke-stub` without weakened assertions.
- [x] 2.4 Extend existing browser walks to wait for recognizable current content before prompt screenshots and prove restored autosave content in read-only rendering; run `make verify-ui`, retain screenshots and zero unexpected diagnostics, preserving all existing request-order assertions and corrupt-preview behavior.

## 3. Delivery

- [x] 3.1 After runtime proof, update the owning fixture decision and historical evidence qualification, retain scanned bound evidence, and pass relevant Python/TypeScript formatting/lint plus docs/decision/strict-spec checks without unrelated full application suites.
- [x] 3.2 Complete correctness, test-evidence/spec-compliance and invariant-state review, exact-head authorized CI and exact intended closing-set gates; merge and archive the fulfilled contract.

## Risk packs

| Pack                                           | Selection and evidence                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API / CLI / script entry                | Selected:2.1–2.4 cover shared stub HTTP and existing harness consumers; no route additions.                                                 |
| Config / project setup                         | Selected:2.1 preserves existing DOCX input and migrates any shared valid generator without new knobs or dependencies.                       |
| File IO / path safety / overwrite              | Selected:2.1–2.3 cover local configured package reads/variant writes in memory and exact served bytes; no extraction or user-data mutation. |
| Schema / columns / units / field names         | Selected:2.2–2.3 bind SHA256/size/version metadata to bytes; public field names unchanged.                                                  |
| Auth / permissions / secrets                   | Not selected for behavior: no auth/permission changes;3.1 scans retained evidence and existing browser assertions remain.                   |
| Concurrency / shared state / ordering          | Selected:2.3–2.4 preserve chat/file/session/history and prompt/request-order state transitions under the existing lock.                     |
| Resource limits / large input / discovery      | Not selected: small trusted harness packages; no production parser/input-limit or test discovery changes.                                   |
| Legacy compatibility / examples                | Selected:2.1–2.4 cover ordinary configured input, unconfigured seeds, corrupt preview and existing smoke/browser consumers.                 |
| Error handling / rollback / partial outputs    | Selected:2.3–2.4 retain stale refusal and intentional corrupt rendering; no fake success for invalid configured input.                      |
| Release / packaging / dependency compatibility | Not selected: no shipped product, dependency or image change;3.2 still requires exact-head delivery checks.                                 |
| Documentation / migration notes                | Selected:3.1–3.2 update existing owning records and preserve historical evidence rather than rewriting screenshots.                         |

## Evidence boundary

Parent owns the baseline, probe and acceptance evidence; implementer edits only the authorized source/test/docs slice and runs no mid-flight checks. Browser proof uses the existing real SPA/renderers through an isolated deterministic stub gateway, not real DocumentServer/deployment. No new worktrees, no relaxed diagnostic/assertion expectations, no snapshot regeneration presented as semantic preservation. All temporary owned services and files are cleaned through existing lifecycle handling.
