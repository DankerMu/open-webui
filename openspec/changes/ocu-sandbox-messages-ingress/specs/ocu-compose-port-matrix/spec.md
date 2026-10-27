## MODIFIED Requirements

### Requirement: Proxy-only host publication

The deployment SHALL publish host ports only for its reverse proxy. WebUI, OCU, database, maintenance and initialization services SHALL have no host publications, including loopback publications. Control-plane services SHALL use the control-plane bridge, not host or shared-container networking, and SHALL NOT join the sandbox bridge. The single exception is the `messages-ingress` service, which SHALL join exactly the control-plane bridge and the sandbox bridge at the validated `OCU_SANDBOX_MESSAGES_ADDRESS` and publish no host port.

#### Scenario: Complete deployment matrix

- **WHEN** all deployment stacks are resolved and checked
- **THEN** the configured proxy publication is present exactly once and no other service exposes a host port
- **AND** both application services remain reachable by the proxy over the control-plane network

#### Scenario: Publication reintroduced

- **WHEN** WebUI, OCU or another non-proxy service gains a host publication, including a loopback-only publication
- **THEN** the deployment port check exits nonzero and no service is started by the deployment entry

#### Scenario: Network-mode bypass

- **WHEN** a deployment service uses host networking, another service/container network namespace, or the sandbox bridge, other than `messages-ingress` on control plus sandbox at its validated address
- **THEN** preflight refuses the topology before starting services
