# Tasks

## 1. Implementation and evidence

- [x] 1.1 Add consumer-visible HTTP/transport and fallback regressions; demonstrate failure against pre-change cleanup, then passing behavior after the minimal repair.
- [x] 1.2 Preserve ownership, redaction, successful statuses and lifecycle status/resource cleanup; verify the scenarios in design.md with focused tests.
- [x] 1.3 Exercise actual HTTP cleanup against a throwaway loopback server; observe later deletes and retained unowned data after injected failure; remove the probe after preserving its output.
- [x] 1.4 Update the existing smoke documentation or changelog with best-effort cleanup behavior; run make lint-scoped, make doc-gate and make decisions-verify.
- [x] 1.5 Run focused pytest and make smoke-proxy; record actual command outputs without claiming unexercised paths.

## 2. Risk packs

- Public API / CLI / script entry: selected; lifecycle exit-code scenarios and make smoke-proxy.
- Config / project setup: not selected; no configuration changes.
- File IO / path safety / overwrite: selected; ownership and scratch-preservation scenarios; no file-deletion policy change.
- Schema / columns / units / field names: not selected; no schema changes.
- Auth / permissions / secrets: selected; exact ownership and aggregate redaction assertions.
- Concurrency / shared state / ordering: not selected; serial cleanup and lifecycle ordering are preserved, concurrent cleanup is out of scope.
- Resource limits / large input / discovery: not selected; no discovery or capacity-policy change.
- Legacy compatibility / examples: selected; successful statuses, absent admin session and lifecycle status scenarios.
- Error handling / rollback / partial outputs: selected; first DELETE and per-fallback HTTP/transport failures.
- Release / packaging / dependency compatibility: not selected; no dependency changes.
- Documentation / migration notes: selected; task 1.4 and doc-gate.
