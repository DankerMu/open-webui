## MODIFIED Requirements

### Requirement: Explicit destination policy

The deployment SHALL require an explicitly configured IPv4 address/CIDR allowlist. An unset policy SHALL fail configuration; an explicitly empty policy SHALL deny new sandbox-initiated IP traffic when the firewall is installed. Deployment preflight SHALL additionally require the allowlist to cover `OCU_SANDBOX_MESSAGES_ADDRESS`, so an empty or non-covering allowlist fails deployment before any service starts. Invalid or unsupported entries SHALL fail without changing firewall state. The control-plane subnet and metadata address SHALL remain denied even when included in an allowed range. Allowed destinations SHALL only be exempted from this guard, not bypass unrelated downstream host policy.

#### Scenario: Listed and unlisted destinations

- **WHEN** a sandbox initiates traffic to a listed destination and an unlisted public, company or host destination
- **THEN** this policy permits the listed destination and drops the unlisted destination

#### Scenario: Explicit deny-all and missing configuration

- **WHEN** the firewall is installed with an explicitly empty allowlist
- **THEN** no new sandbox-originated IP destination is permitted
- **AND** an unset or malformed setting instead fails deployment with a configuration error

#### Scenario: Deployment requires the Messages ingress allow

- **WHEN** `deploy/up.sh` or bootstrap runs with an allowlist that is empty or does not cover `OCU_SANDBOX_MESSAGES_ADDRESS`
- **THEN** it fails naming the variable before any Compose start or firewall change

#### Scenario: Protected destinations override a broad allow

- **WHEN** an allowed CIDR includes the control-plane subnet or metadata address
- **THEN** sandbox-initiated traffic to those protected destinations is still dropped
