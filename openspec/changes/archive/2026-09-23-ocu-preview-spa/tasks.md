# Tasks

## 1. SPA migration

- [x] 1.1 Approve expanded fixture and strict validation; record shared request/provenance and revision-window decisions. Target400 reviewable lines; justify any overflow with the atomic merged7.2/7.3 slice and issue16 HTTP-validator decision's pagination hand-off, never drop required evidence to fit.
- [x] 1.2 Migrate relative imports, module-relative assets, shared HTTP wrapper and terminal WS; Node VM tests cover empty/nested prefix, segment boundaries, server provenance, headers and actual BrowserViewer calls.
- [x] 1.3 Move heartbeat into managed wrapper effect and source badge from describe; behavioral tests prove timer/header/cleanup, no runtime-cli request, both stopped branches using one alias and no start after failure.
- [x] 1.4 Implement revision-keyed selection/render and consistent paginated window/more control; tests prove unchanged preservation, rename/delete, stalecursor restart bound, late response rejection and stale render completion rejection.
- [x] 1.5 Add Office label/disclaimer and uncached formula marker using existing locale/renderers; deterministic real workbook evidence distinguishes absent cache from zero/false and covers sheet switching.
- [x] 1.6 Update existing README/changelog and affected prefix test assumptions; no vendored renderer/dependency or deployment edits.
- [x] 1.7 Update tests/orchestrator/test_preview_prefix.py: scan all static/\*.js for root-absolute /static/ literals, replace the three heartbeat source-string assertions with request behavior, and extend the VM linker to load the real shared wrapper module rather than an undefined export. Preserve existing empty/nested prefix and ws/wss cases.

## 2. Acceptance

- [x] 2.1 Preserve semantic RED/GREEN for changed behavior; parent runs pinned non-Docker suite, Node-backed tests and structure checks.
- [x] 2.2 Exercise actual SPA/OCU HTTP through an ephemeral host prefix proxy with real Office fixtures; save initial/updated A-T02/A-T03/A-T04 screenshots, console/network logs and behavioral assertions. No Docker; dependency stubs only for lifecycle/describe unavailable on host.
- [x] 2.3 Expanded correctness/integration, security/performance and evidence/spec cross-review; bounded repairs, CI, merge, fixture archive.

## Risk packs

API/compatibility:1.2–1.4 URLprovenance and broker pagination. Auth/secrets:1.2–1.3 header boundary and no browser token. Async/state/concurrency:1.3–1.4 timers, request/render generations and selected identity. Resources:1.4 bounded page window/retry. File rendering/schema:1.5 real OOXML and formula-cache distinctions. Packaging/config:1.2 relative assets and empty/nested prefix. Error/partialfailure:1.3–1.5 failedlaunch/stalepage/renderfallback. UI evidence:2.2 actual screenshots. Documentation:1.1/1.6. No deployment/migration/new dependency; Docker acceptance#36.

## Evidence

OCU PR11 merged at0827f99; clean reviewed head e2beea998e42e5f25fbbf4f4b20a62dcbf784ebf. Parent suite649 passed/5 skipped, structure24; actual Office refresh and mounted lifecycle checks passed with zero console errors. Two explicit user gate extensions; final round5 clean. Parent actual component-unmount oracle fails on6f191b9 and passes on final source; successful old200 response completes the real FilesView chain after deletion without replacing empty state, and the same oracle rejects a stale-commit fault. Tab round-trip retains worksheet2.

Screenshots and reports are committed under docs/evidence/issue-17. Review and execution record: https://github.com/DankerMu/open-computer-use/pull/11#issuecomment-5806554534. HTML srcdoc/src is opaque-sandboxed; generated-content responses use framework-encoded inline disposition while download=1 remains attachment. Production proxy/Docker acceptance remains#36.
