## Purpose

Define the deployment boundary that keeps application services private and provisions the independent sandbox network required for gateway-bound access.

## ADDED Requirements

### Requirement: Proxy-only host publication

The deployment SHALL publish host ports only for its reverse proxy. WebUI, OCU, database, maintenance and initialization services SHALL have no host publications, including loopback publications. Control-plane services SHALL use the control-plane bridge, not host or shared-container networking, and SHALL NOT join the sandbox bridge.

#### Scenario: Complete deployment matrix

- **WHEN** all deployment stacks are resolved and checked
- **THEN** the configured proxy publication is present exactly once and no other service exposes a host port
- **AND** both application services remain reachable by the proxy over the control-plane network

#### Scenario: Publication reintroduced

- **WHEN** WebUI, OCU or another non-proxy service gains a host publication, including a loopback-only publication
- **THEN** the deployment port check exits nonzero and no service is started by the deployment entry

#### Scenario: Network-mode bypass

- **WHEN** a deployment service uses host networking, another service/container network namespace, or the sandbox bridge
- **THEN** preflight refuses the topology before starting services

### Requirement: Independent provisioned sandbox bridge

The deployment SHALL provision a dedicated non-internal IPv4 bridge independently of Compose teardown. Its subnet SHALL not overlap the control-plane subnet; its name SHALL differ from the control-plane name. OCU SHALL receive the bridge name and subnet, and SHALL publish sandbox service ports only on that bridge's gateway through its native network policy. Provisioning SHALL preserve existing networks and containers, refusing incompatibility rather than mutating them.

#### Scenario: Missing bridge

- **WHEN** the configured sandbox bridge is absent
- **THEN** deployment creates it with the configured bridge driver, non-internal policy, subnet and gateway and verifies the resulting network before starting services

#### Scenario: Compatible existing bridge

- **WHEN** the bridge already exists with the required properties
- **THEN** deployment reuses it without replacement, and stopping the Compose application stacks does not delete it

#### Scenario: Incompatible or unreadable bridge

- **WHEN** network inspection fails for a reason other than absence, or returns incompatible driver, internal mode, subnet or gateway
- **THEN** deployment exits nonzero without starting services, deleting networks or changing sandbox containers

#### Scenario: Concurrent network creation

- **WHEN** another process creates the network between inspection and creation
- **THEN** deployment succeeds only after inspecting and validating the resulting network against the same contract

### Requirement: Fail-closed deployment preflight

The deployment entry SHALL check the complete resolved stack configuration before starting any service. The checker SHALL reject incomplete or malformed inputs, missing or duplicate critical services, and incorrect proxy publications. Temporary resolved configuration containing credentials SHALL remain private and SHALL be removed on success, failure and handled interruption. Diagnostics SHALL NOT print credentials or complete environment blocks.

#### Scenario: Invalid or incomplete resolved configuration

- **WHEN** resolved JSON is malformed or a required application/proxy stack is missing or duplicated
- **THEN** the check exits nonzero without claiming a valid port matrix

#### Scenario: Preflight command failure

- **WHEN** configuration resolution, port validation or network provisioning fails
- **THEN** the deployment entry returns nonzero, starts no service, and cleans private temporary configuration files

### Requirement: Packaged canonical proxy policy

The deployment proxy SHALL execute the existing canonical renderer before accepting requests, using explicit control-plane upstream addresses and a container-reachable listen address. Generated configurations, tokens and runtime logs SHALL NOT be included in the image build inputs. Rendering and serving SHALL use a compatible unprivileged identity and preserve private generated-file permissions.

#### Scenario: Valid proxy startup

- **WHEN** required configuration and both upstream services are available
- **THEN** the renderer validates the configuration and the proxy serves through the intended listen endpoint using the canonical access policy

#### Scenario: Proxy render failure

- **WHEN** the internal token or another required render input is missing or invalid
- **THEN** startup fails without serving requests or exposing the token in diagnostics
