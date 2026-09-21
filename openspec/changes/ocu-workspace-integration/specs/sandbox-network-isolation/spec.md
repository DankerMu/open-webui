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

Host firewall rules in the `DOCKER-USER` chain SHALL DROP traffic from the sandbox subnet to the control-plane compose subnet, the Docker socket host address, and the metadata address; the overlay SHALL ship an idempotent rule script and a check that fails the deploy when the rules are absent (A-T08).

#### Scenario: curl from inside sandbox (A-T08)

- **WHEN** a process inside a sandbox runs `curl` against OCU, WebUI or the proxy control-plane addresses
- **THEN** the connection times out or is refused at L3; no HTTP status is returned

#### Scenario: Egress still works (A-T14 with allowlist)

- **WHEN** the sandbox fetches an allowed external address per `NETWORK-HARDENING.md:20`
- **THEN** the request succeeds

#### Scenario: Missing rules fail deploy

- **WHEN** the deploy check runs on a host where the `DOCKER-USER` rules are absent
- **THEN** the deploy exits non-zero and names the missing rule

### Requirement: Dynamic ports publish on the gateway only

CDP and ttyd ports SHALL be published only on the sandbox bridge gateway address (decision 11 / `private-sandbox-port-bindings.patch`), and the orchestrator SHALL reach them via that address.

#### Scenario: Port binding

- **WHEN** a sandbox starts ttyd
- **THEN** its port is bound to the gateway address only and is not reachable from the LAN
