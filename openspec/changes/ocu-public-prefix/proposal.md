# Proposal

Issue type: feature
Fixture level: expanded
Upstream suggested level: expanded (agree: shared SPA entrypoint and configuration)
Blast radius: shell assets or CDP requests reach WebUI instead of OCU.
Selected risk packs: Public API; Config; Schema; Auth; Legacy compatibility; Error handling; Documentation.
Evidence floor: real server responses/static mount with empty and nonempty prefix; execute browser-viewer address construction with mocked browser transports; pinned non-Docker regression suite.

## Why

Issue14 implements task7.1. Root-absolute shell URLs collide with WebUI under the same-origin `/ocu` deployment.

## What Changes

- Read `OCU_PUBLIC_PREFIX`, default empty; emit shell asset/API/files/heartbeat URLs under it exactly once.
- Emit unprefixed WebUI `describeUrl` and mount static assets at `{prefix}/static` only.
- Adapt browser-viewer HTTP discovery and WebSocket connect/reconnect addresses, preserving default URLs.
- Reject noncanonical prefix configuration before serving.

## Capabilities

### New Capabilities

- `ocu-public-prefix`: server shell/static mount and browser-viewer address contract.

### Modified Capabilities

None. Parent gateway capability remains the full epic contract; this slice does not claim issue16/17 behavior.

## Impact

OCU app.py, static/browser-viewer.js, paired tests under tests/orchestrator/ and minimal existing docs/config example. No dependencies or CI changes. Issue17 retains preview.js fetch wrapper, module/script/worker assets, badge consumption, revision detection and Office labels. Browser-viewer address adaptation stays in issue14 as explicitly requested; it is not silently reassigned.
