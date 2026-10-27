## ADDED Requirements

### Requirement: Path-restricted Messages ingress on the sandbox network

The deployment SHALL run exactly one ingress on the sandbox network, at the configured fixed IPv4 address and port 8080, that forwards only `POST /api/v1/messages` and `POST /api/v1/messages/count_tokens` to Open WebUI with an allowlisted set of request headers, answers `GET /healthz` locally, and answers every other method or path locally with 404 without contacting Open WebUI. Deployment checks SHALL exempt only this ingress from the rules that keep services and non-policy DNS off the sandbox network. The ingress SHALL hold no deployment secret, SHALL publish no host port, and its address SHALL be validated against the sandbox subnet and the egress allowlist before any Compose start.

#### Scenario: Sandbox calls the Messages endpoint

- **GIVEN** a sandbox on the sandbox network and a user's Open WebUI token
- **WHEN** it sends `POST http://<ingress address>:8080/api/v1/messages` with that token
- **THEN** the request reaches Open WebUI with its body, query and Anthropic headers, and the response streams back
- **AND** cookies, forwarded-for and identity headers sent by the sandbox are not forwarded

#### Scenario: Any other path is refused at the ingress

- **WHEN** a sandbox requests any other path or method at the ingress address, including path-normalisation tricks
- **THEN** the ingress answers 404 and Open WebUI receives no request

#### Scenario: Control plane stays unreachable

- **WHEN** a sandbox connects to Open WebUI, Computer Use, the proxy ports or the host
- **THEN** the connection is dropped as before; only the ingress address is newly reachable

#### Scenario: Misconfigured ingress address

- **WHEN** the ingress address is missing, not IPv4, outside the sandbox subnet, the gateway, the network or broadcast address, or not covered by the egress allowlist (including an empty allowlist)
- **THEN** deployment fails before any Compose start with an error naming the variable

#### Scenario: Only the ingress is exempt from sandbox-network checks

- **WHEN** any other service joins the sandbox network, or any other container on the sandbox bridge has non-policy DNS
- **THEN** the deployment checks still fail as before
