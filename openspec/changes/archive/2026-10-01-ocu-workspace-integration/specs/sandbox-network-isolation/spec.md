# Spec Delta

## Purpose

Sandboxes cannot reach the OCU/WebUI control plane at L3, at creation and after every restart: dedicated bridge, no compose-network attach anywhere, `DOCKER-USER` DROP rules, port publication on the bridge gateway only. Source: Plan 1 § 2 沙箱网络隔离.

## ADDED Requirements

### Requirement: Dedicated sandbox bridge, no compose attach on any path

Sandbox containers SHALL be attached only to a dedicated bridge network that is not `internal` (egress is required); the orchestrator SHALL NOT join that network; `_get_compose_network_name` and every call site that attaches or re-attaches a sandbox to the compose network (`_create_container`, `_fix_dead_networks`, the `restart-container` endpoint's inline copy) SHALL be removed, and `get_container_service_address` SHALL resolve CDP/ttyd addresses through the sandbox bridge gateway instead of a compose-network IP.

#### Scenario: Sandbox network membership at creation

- **WHEN** a sandbox is created
- **THEN** `docker inspect` shows exactly one network, the sandbox bridge, and the orchestrator container is not on it

#### Scenario: Membership survives stop → launch

- **WHEN** a sandbox is stopped and then launched (including the restart alias and recreate-from-meta)
- **THEN** `docker inspect` still shows exactly one network, the sandbox bridge

#### Scenario: Address resolution

- **WHEN** the orchestrator needs the CDP or ttyd address of a sandbox
- **THEN** it resolves the bridge gateway address and published port, never a compose-network IP

### Requirement: L3 control-plane isolation

Host firewall rules SHALL enforce an explicit destination allowlist for all sandbox-originated IP egress, including public, company and host-local destinations; unlisted destinations SHALL be denied. The control-plane compose subnet and metadata address SHALL remain hard-denied even within an allowed range. Forwarded traffic SHALL be protected through DOCKER-USER and host-local traffic through INPUT; control-initiated CDP/ttyd replies SHALL remain possible. Unsupported IPv6 SHALL not bypass default deny. The overlay SHALL ship an idempotent installer and an ordered-policy check that fails deployment on missing, shadowed or stale enforcement. Full all-egress closure also requires explicit DNS routing and existing-container compatibility in mandatory issue79; inherited host-namespace DNS is not covered merely by bridge-origin rules.

#### Scenario: curl from inside sandbox (A-T08)

- **WHEN** a process inside a sandbox runs `curl` against OCU, WebUI or the proxy control-plane addresses
- **THEN** the connection times out or is refused at L3; no HTTP status is returned

#### Scenario: Egress still works (A-T14 with allowlist)

- **WHEN** the sandbox fetches an explicitly allowlisted external address
- **THEN** this guard permits that request, while an otherwise equivalent request to an unlisted destination is dropped

#### Scenario: Missing rules fail deploy

- **WHEN** the deploy check finds missing, duplicated, shadowed or misordered guard rules or hooks
- **THEN** the deploy exits non-zero and names the defective rule or chain

### Requirement: Dynamic ports publish on the gateway only

CDP and ttyd ports SHALL be published only on the sandbox bridge gateway address (decision 11 / `private-sandbox-port-bindings.patch`), and the orchestrator SHALL reach them via that address.

#### Scenario: Port binding

- **WHEN** a sandbox starts ttyd
- **THEN** its port is bound to the gateway address only and is not reachable from the LAN
