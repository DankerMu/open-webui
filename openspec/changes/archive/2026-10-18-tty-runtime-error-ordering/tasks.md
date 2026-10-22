# Tasks

## 1. Contract and diagnosis

- [x] 1.1 Capture unchanged-target failing schedule and worker-first control, including real errno, descriptor and owner-state observations in the diagnostic receipt.
- [x] 1.2 Obtain expanded fixture review and `openspec validate tty-runtime-error-ordering --strict --no-interactive` exit0 before implementation.

## 2. Implementation and evidence

- [x] 2.1 Synchronize the runtime case through completed handler attribution before owner exit; prove controlled failing-before/passing-after without altering shared lifetime classification or weakening assertions.
- [x] 2.2 Prove real operation failure/owner-state/exception identity and singular delivery; use temporary no-error and swallowed-error probes to prove distinct failure diagnostics.
- [x] 2.3 Run consumer/native/shared-origin modules and the deploy suite with the qualified interpreter; retain all outcome and resource-retirement assertions and report exact executed scope.
- [x] 2.4 Update the existing test documentation, run strict/docs/whitespace checks and complete three-seat review; publish exact-head local evidence with empty automatic closing references.

## Risk packs

Selected:

- Concurrency / shared state / ordering: 2.1 and 2.3 cover EOF/handler/owner ordering and bounded joins.
- Error handling / rollback / partial outputs: 2.2 and 2.3 prove runtime propagation, teardown contrast and resource retirement.
- Documentation / migration notes: 2.4 documents the test's synchronization contract.

Not selected:

- Public API / CLI / script entry: no invocation/interface change; existing deploy execution retained in 2.3.
- Config / project setup: no config or environment change.
- File IO / path safety / overwrite: no file operations change; real network socket retirement belongs to selected lifecycle evidence.
- Schema / columns / units / field names: no schema change.
- Auth / permissions / secrets: public synthetic HTTP handshake only; no credentials or permission changes.
- Resource limits / large input / discovery: no workload or discovery change; bounded joins covered by concurrency evidence.
- Legacy compatibility / examples: no compatibility or example migration.
- Release / packaging / dependency compatibility: exact qualified environment retained; no release/hosted/LAN claim.
