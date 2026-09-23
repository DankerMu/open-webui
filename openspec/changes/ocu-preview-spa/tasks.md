# Tasks

## 1. SPA migration

- [ ] 1.1 Approve expanded fixture and strict validation; record shared request/provenance and revision-window decisions. Target400 reviewable lines; justify any overflow with the atomic merged7.2/7.3 slice and issue16 HTTP-validator decision's pagination hand-off, never drop required evidence to fit.
- [ ] 1.2 Migrate relative imports, module-relative assets, shared HTTP wrapper and terminal WS; Node VM tests cover empty/nested prefix, segment boundaries, server provenance, headers and actual BrowserViewer calls.
- [ ] 1.3 Move heartbeat into managed wrapper effect and source badge from describe; behavioral tests prove timer/header/cleanup, no runtime-cli request, both stopped branches using one alias and no start after failure.
- [ ] 1.4 Implement revision-keyed selection/render and consistent paginated window/more control; tests prove unchanged preservation, rename/delete, stalecursor restart bound, late response rejection and stale render completion rejection.
- [ ] 1.5 Add Office label/disclaimer and uncached formula marker using existing locale/renderers; deterministic real workbook evidence distinguishes absent cache from zero/false and covers sheet switching.
- [ ] 1.6 Update existing README/changelog and affected prefix test assumptions; no vendored renderer/dependency or deployment edits.
- [ ] 1.7 Update tests/orchestrator/test_preview_prefix.py: scan all static/*.js for root-absolute /static/ literals, replace the three heartbeat source-string assertions with request behavior, and extend the VM linker to load the real shared wrapper module rather than an undefined export. Preserve existing empty/nested prefix and ws/wss cases.

## 2. Acceptance

- [ ] 2.1 Preserve semantic RED/GREEN for changed behavior; parent runs pinned non-Docker suite, Node-backed tests and structure checks.
- [ ] 2.2 Exercise actual SPA/OCU HTTP through an ephemeral host prefix proxy with real Office fixtures; save initial/updated A-T02/A-T03/A-T04 screenshots, console/network logs and behavioral assertions. No Docker; dependency stubs only for lifecycle/describe unavailable on host.
- [ ] 2.3 Expanded correctness/integration, security/performance and evidence/spec cross-review; bounded repairs, CI, merge, fixture archive.

## Risk packs

API/compatibility:1.2–1.4 URLprovenance and broker pagination. Auth/secrets:1.2–1.3 header boundary and no browser token. Async/state/concurrency:1.3–1.4 timers, request/render generations and selected identity. Resources:1.4 bounded page window/retry. File rendering/schema:1.5 real OOXML and formula-cache distinctions. Packaging/config:1.2 relative assets and empty/nested prefix. Error/partialfailure:1.3–1.5 failedlaunch/stalepage/renderfallback. UI evidence:2.2 actual screenshots. Documentation:1.1/1.6. No deployment/migration/new dependency; Docker acceptance#36.
