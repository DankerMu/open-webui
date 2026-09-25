# Tasks

## 1. Topology and adoption

- [x] 1.1 Adopt the existing core/WebUI overlays and their required local dependencies, remove direct publications, and wire explicit control-plane/sandbox network inputs; verify source structure and submitted dependency closure without emulating Compose merging.
- [x] 1.2 Add persistent sandbox-bridge provisioning and network compatibility validation; exercise missing/compatible/incompatible/error/concurrent-create cases with an independent fake engine and assert no destructive operations.
- [x] 1.3 Add the proxy container packaging around the canonical renderer; exercise the actual entrypoint with native nginx/local upstreams for forwarding, private files, shutdown, and fail-closed missing input.

## 2. Preflight and evidence

- [x] 2.1 Add `deploy/check-ports.sh` over resolved JSON; executable tests reject WebUI/OCU/other loopback publications, proxy mapping errors, host/shared networking, sandbox membership, malformed data, missing/duplicate critical services, while accepting the complete intended matrix.
- [x] 2.2 Add the deployment entry that resolves every stack, checks before start, validates/provisions networks, and starts upstream stacks before proxy; fake-CLI scenarios prove failure propagation, no starts on preflight failure, cleanup and signal handling.
- [x] 2.3 Capture red/green or isolated fault-sensitivity evidence for new negative-path judges; run focused parent tests and native smoke, with exact command/exit output. Do not count setup failure or fake state as real engine evidence.

## 3. Handoff and review

- [x] 3.1 Retire the obsolete private port-binding patch and its usage claim within authorized files; update deployment instructions and a control-repo decision record, naming #26 bootstrap/env and #34 backup handoffs without changing their behavior.
- [x] 3.2 Obtain expanded correctness, security/integration, and evidence reviews; satisfy bounded repair and exact-head CI gates. CI changes must be explicitly reported; no new Docker job is executed in this slice.
- [x] 3.3 Record actual Compose config/build/start, bridge/runtime publication inspection, and full network acceptance as deferred to [#36](https://github.com/DankerMu/open-webui/issues/36#issuecomment-5830624433) under the user's all-Docker deferral. This checkbox completes on a linked handoff, not on a claim that Docker acceptance passed.

## Risk mapping

- CLI: selected; checker and deployment entry success/failure scenarios (2.1, 2.2).
- Config/project setup: selected; complete multi-stack matrix and fresh-checkout local dependencies (1.1).
- File IO/path safety: selected; private temporary config cleanup and explicit image copy boundary (1.3, 2.2).
- Schema/columns/units: not selected; no persisted schema change; resolved Compose JSON shape belongs to CLI validation.
- Auth/permissions/secrets: selected; no generated config in image context, unprivileged proxy, redacted failures (1.3).
- Concurrency/shared state: selected; network creation race and preservation (1.2).
- Resource limits/large discovery: not selected; trusted deployment configuration only, no workload resource-policy change.
- Legacy compatibility/examples: selected; base dev files preserved, old patch retired, explicit operator migration (1.1, 3.1).
- Error handling/rollback: selected; preflight failures prevent starts, no destructive network migration (1.2, 2.2).
- Release/packaging/dependency compatibility: selected; native packaging smoke now, actual container build deferred (1.3, 3.3).
- Documentation/migration: selected; decision record, run instructions and deferred evidence handoff (3.1, 3.3).
