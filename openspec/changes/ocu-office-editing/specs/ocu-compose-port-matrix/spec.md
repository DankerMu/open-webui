# Spec Delta

## ADDED Requirements

### Requirement: DocumentServer in the checked matrix

The deployment port check SHALL treat DocumentServer as a required service whether the Office editing flag is on or off: a missing or duplicated DocumentServer service SHALL be rejected. The check SHALL reject a DocumentServer service that publishes any host port, including a loopback publication, that joins the sandbox bridge, or that is not attached to the control-plane bridge shared with the proxy and OCU. The check SHALL reject a proxy whose DocumentServer listener or DocumentServer upstream configuration does not name the second container listen port and DocumentServer's control-plane address. Every rejection SHALL happen before any service is started.

#### Scenario: DocumentServer publishes a port

- **WHEN** the resolved DocumentServer service declares any host publication, including a loopback-only one
- **THEN** the deployment port check exits nonzero naming the service and no service is started by the deployment entry

#### Scenario: DocumentServer on the sandbox bridge

- **WHEN** the resolved DocumentServer service joins the sandbox bridge, alone or in addition to the control-plane bridge
- **THEN** the deployment port check exits nonzero naming the service and no service is started

#### Scenario: DocumentServer joins another network

- **WHEN** DocumentServer is attached to the control-plane bridge and an additional network other than the sandbox bridge
- **THEN** the deployment port check exits nonzero naming DocumentServer and no service is started

#### Scenario: DocumentServer missing or duplicated

- **WHEN** the resolved stacks contain no DocumentServer service, or contain it twice
- **THEN** the check exits nonzero without claiming a valid port matrix

#### Scenario: Proxy not wired to DocumentServer

- **WHEN** the proxy's DocumentServer listener or upstream configuration is absent or names another address
- **THEN** the check exits nonzero naming the proxy and no service is started

## MODIFIED Requirements

### Requirement: Proxy-only host publication

The deployment SHALL publish host ports only for its reverse proxy, and the proxy SHALL publish exactly two: the OCU gateway port and the DocumentServer listener port. WebUI, OCU, DocumentServer, database, maintenance and initialization services SHALL have no host publications, including loopback publications. Control-plane services, DocumentServer among them, SHALL use the control-plane bridge, not host or shared-container networking, and SHALL NOT join the sandbox bridge.

#### Scenario: Complete deployment matrix

- **WHEN** all deployment stacks are resolved and checked
- **THEN** each of the two configured proxy publications is present exactly once and no other service exposes a host port
- **AND** both application services and DocumentServer remain reachable by the proxy over the control-plane network

#### Scenario: Publication reintroduced

- **WHEN** WebUI, OCU, DocumentServer or another non-proxy service gains a host publication, including a loopback-only publication
- **THEN** the deployment port check exits nonzero and no service is started by the deployment entry

#### Scenario: Network-mode bypass

- **WHEN** a deployment service uses host networking, another service/container network namespace, or the sandbox bridge
- **THEN** preflight refuses the topology before starting services

#### Scenario: Wrong number of proxy publications

- **WHEN** the resolved proxy service declares one publication, three publications, or two publications of which one does not map its configured host port to its listener
- **THEN** the deployment port check exits nonzero and no service is started by the deployment entry

### Requirement: Packaged canonical proxy policy

The deployment proxy SHALL execute the existing canonical renderer before accepting requests, using explicit control-plane upstream addresses for WebUI, OCU and DocumentServer and a container-reachable listen address for each of its two listeners. Generated configurations, tokens and runtime logs SHALL NOT be included in the image build inputs. Rendering and serving SHALL use a compatible unprivileged identity and preserve private generated-file permissions.

#### Scenario: Valid proxy startup

- **WHEN** required configuration and all three upstream services are available
- **THEN** the renderer validates the configuration and the proxy serves through both intended listen endpoints using the canonical access policy

#### Scenario: Proxy render failure

- **WHEN** the internal token or another required render input is missing or invalid
- **THEN** startup fails without serving requests or exposing the token in diagnostics
