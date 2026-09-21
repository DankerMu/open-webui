# Spec Delta

## Purpose
The LAN deployment overlay in the OCU repo (`deploy/`): proxy configuration, sandbox bridge and firewall rules, pinned images, offline materials, backup and rollback, and the feature flag's semantics. Source: Plan 1 § 2 topology, § 工作包 A4, § 验证、发布与回滚.

## ADDED Requirements

### Requirement: Topology
The overlay SHALL run WebUI, OCU and the reverse proxy on the control-plane compose network, the sandbox bridge separately, and expose to the LAN only the proxy; the compose port matrix SHALL publish no port for OCU or WebUI (the existing `127.0.0.1:${PORT}` publications in the overlay are removed); the deploy script SHALL run a check that fails when any service other than the proxy publishes a port.

#### Scenario: Port exposure
- **WHEN** `docker compose ps` is inspected on the deployed host
- **THEN** only the proxy publishes a LAN port; OCU and WebUI publish none, and a direct probe of OCU's former port from the LAN is refused

#### Scenario: Deploy check
- **WHEN** a compose override re-adds a WebUI or OCU port publication
- **THEN** the deploy check exits non-zero naming the service

### Requirement: Pinned, offline-capable build
Images SHALL be pinned by digest; WebUI SHALL be built from this fork's checkout; Pyodide/npm/Python fetches SHALL be part of the offline bundle; runtime SHALL disable external CDNs, automatic model downloads and update checks; the build SHALL record git SHA, build args and static asset versions.

#### Scenario: Air-gapped start (A-T14)
- **WHEN** WAN is blocked, the model endpoint is switched to the internal API and the stack is restarted
- **THEN** HTML/Office/font/terminal/browser fixtures work and no request leaves the LAN (Draw.io, if enabled, is served locally)

### Requirement: Backup and rollback
Backups SHALL include the database (with `ocu_chat_state`), OCU per-chat directories and configuration in one consistent set; rollback SHALL pin the previous images while keeping the additive schema; the old unauthenticated direct OCU entry SHALL NOT be a rollback path.

#### Scenario: Restore (A-T15)
- **WHEN** a backup is restored and images are rolled back one version
- **THEN** outputs, revisions and chat ownership are intact and no permission is wider than before

### Requirement: Feature flag semantics
`ENABLE_OCU_WORKSPACE=false` SHALL hide the sidebar and 404 the WebUI workspace routes while the proxy allowlist and internal token stay in force.

#### Scenario: Flag off
- **WHEN** the flag is off and a browser requests `/ocu/api/outputs/{chat_id}` directly
- **THEN** the proxy still requires `auth_request` and OCU still requires the token; nothing is newly exposed

### Requirement: Terminal defaults to plain Bash
The overlay SHALL configure the sandbox terminal so that a new terminal session starts an interactive `bash` login shell and no coding CLI (sub-agent CLI or similar) is started automatically; coding CLIs remain available for the user or model to run explicitly (Plan 1 既有约束, A4). The mechanism is `OCU_SANDBOX_NO_AUTOSTART=1` in the OCU environment (spec sandbox-lifecycle); the historical source patch `deploy/production-like-test/patches/disable-cli-autostart.patch` SHALL be removed.

#### Scenario: New terminal session
- **WHEN** the owner opens the Terminal view on a fresh sandbox
- **THEN** the session's foreground process is `bash`, and the process list shows no coding CLI started by the terminal setup

### Requirement: Verification evidence
This repo SHALL gain a separate `make smoke-proxy` target (never part of the `smoke/*.hurl` glob run by `make smoke`) that starts the overlay's proxy config and a deterministic OCU stub against the harness, runs `smoke/proxy/*.hurl` (allowlist, 401/404 mapping, mutating-GET guard, CSP/nosniff headers, prefix URLs), and fails loudly when the proxy or stub cannot start; the proxy config comes from an OCU checkout named by `OCU_CHECKOUT`; CI `layer3-integration-tests` SHALL check out the OCU repo at the SHA pinned in this repo's `constraints.yaml` and SHALL run the target as a required row. The acceptance matrix A-T01–A-T15 SHALL be executed with deterministic fixtures first and one real-model pass second, with screenshots from a normal user's browser.

#### Scenario: Proxy smoke in CI
- **WHEN** `make smoke-proxy` runs in CI
- **THEN** the proxy and stub start, every row passes, and `make smoke` on a checkout without the proxy is unaffected

#### Scenario: Proxy missing
- **WHEN** `make smoke-proxy` runs where the proxy binary/image is unavailable
- **THEN** it exits non-zero naming the missing prerequisite instead of skipping
