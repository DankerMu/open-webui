# ocu-sandbox-egress-guard Specification

## Purpose

Constrain sandbox-originated IP traffic to explicit destination addresses while preserving control-initiated workspace connections and making host-firewall readiness observable before deployment.

## Requirements

### Requirement: Explicit destination policy

The deployment SHALL require an explicitly configured IPv4 address/CIDR allowlist. An unset policy SHALL fail configuration; an explicitly empty policy SHALL deny new sandbox-initiated IP traffic. Invalid or unsupported entries SHALL fail without changing firewall state. The control-plane subnet and metadata address SHALL remain denied even when included in an allowed range. Allowed destinations SHALL only be exempted from this guard, not bypass unrelated downstream host policy.

#### Scenario: Listed and unlisted destinations

- **WHEN** a sandbox initiates traffic to a listed destination and an unlisted public, company or host destination
- **THEN** this policy permits the listed destination and drops the unlisted destination

#### Scenario: Explicit deny-all and missing configuration

- **WHEN** the allowlist is explicitly empty
- **THEN** no new sandbox-originated IP destination is permitted
- **AND** an unset or malformed setting instead fails deployment with a configuration error

#### Scenario: Protected destinations override a broad allow

- **WHEN** an allowed CIDR includes the control-plane subnet or metadata address
- **THEN** sandbox-initiated traffic to those protected destinations is still dropped

### Requirement: Correct packet-path enforcement

The guard SHALL protect both forwarded and host-local packets arriving from the authoritative sandbox bridge interface, independent of their claimed source address. IPv4 rules SHALL run before bypassing host accepts through reachable DOCKER-USER and INPUT hooks; unsupported IPv6 sandbox egress SHALL be dropped through INPUT and FORWARD protection. Control-initiated connection replies SHALL be preserved; an established sandbox-originated connection SHALL not bypass a tightened destination policy.

#### Scenario: Control-initiated workspace reply

- **WHEN** an orchestrator-initiated CDP or ttyd connection receives an established reply from the sandbox
- **THEN** the reply is not dropped by this guard even though its destination is in the control-plane subnet

#### Scenario: Existing sandbox-originated flow loses permission

- **WHEN** a sandbox-originated connection targets an address absent from the current allowlist
- **THEN** its original-direction packets are dropped even if conntrack marks the connection established

#### Scenario: Host-local and forged-source traffic

- **WHEN** traffic from the sandbox bridge targets an unlisted host service, or carries a source address outside the sandbox subnet
- **THEN** ingress-interface policy still applies and the packet does not bypass default deny

#### Scenario: IPv6 cannot bypass the IPv4 policy

- **WHEN** sandbox ingress carries IPv6 traffic, including link-local traffic
- **THEN** it is dropped rather than escaping the IPv4 destination policy

### Requirement: Owned idempotent reconciliation

The installer SHALL maintain one ordered copy of its owned policy and hooks, serialize cooperating mutations, and preserve unrelated rules, policies, networks and containers. It SHALL reconcile stale policy contents, duplicate owned rules and misplaced owned hooks without flushing shared chains. Missing Docker/firewall prerequisites or a failed write SHALL return nonzero. The installer SHALL NOT create a placeholder DOCKER-USER chain or silently convert the host firewall backend.

#### Scenario: Repeated installation

- **WHEN** the rule script runs twice with the same policy
- **THEN** the owned policy and each hook exist once in the required order, with unrelated host rules preserved

#### Scenario: Policy drift and competing installers

- **WHEN** cooperating installer processes encounter stale, duplicated or misplaced owned state
- **THEN** successful reconciliation leaves one ordered policy and preserves foreign state

#### Scenario: Missing prerequisite or failed restore

- **WHEN** Docker's active forwarding hook, required kernel path or firewall backend is absent, or policy restoration fails
- **THEN** installation fails with a specific diagnostic and deployment starts no application service

### Requirement: Read-only deployment readiness check

The check SHALL inspect authoritative bridge identity, reachable first hooks and complete ordered policy contents. Missing, duplicate, unexpected, stale or misordered owned rules SHALL cause a nonzero result naming the affected rule or chain. Deployment SHALL run installation and this check after network provisioning and before every application start, including when reusing an existing bridge. Handled interruption SHALL terminate owned children and clean private deployment snapshots without destructive rollback.

#### Scenario: Missing or shadowed rule

- **WHEN** a required DROP, allow, reply exception or hook is absent, duplicated or placed behind a bypassing rule
- **THEN** the check exits nonzero naming the defect and does not modify the firewall to hide it

#### Scenario: Check or installer failure blocks start

- **WHEN** firewall installation or verification fails, including on a reused bridge
- **THEN** deployment starts no service, returns nonzero and cleans its owned temporary configuration

#### Scenario: Guard does not imply DNS closure

- **WHEN** the bridge-origin guard is installed but sandboxes still inherit host-namespace DNS forwarding
- **THEN** full all-egress readiness is not claimed; mandatory DNS configuration and compatibility acceptance in issue79 must complete before final deployment acceptance
