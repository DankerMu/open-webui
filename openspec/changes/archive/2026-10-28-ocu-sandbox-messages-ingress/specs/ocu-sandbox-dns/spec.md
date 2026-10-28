## MODIFIED Requirements

### Requirement: Read-only deployment readiness

Before firewall installation and service starts, deployment SHALL verify policy and resolved OCU environment agreement and inspect all containers assigned to the protected bridge, including running, stopped and unlabelled containers. Missing or mismatched resolved DNS settings, incompatible existing DNS and uninspectable required state SHALL fail explicitly with the relevant identity. The check SHALL NOT stop, delete, disconnect or recreate containers. Containers demonstrably on other networks SHALL not acquire this DNS compatibility requirement. The Messages ingress container, identified by `Config.Labels` `ocu.role=messages-ingress`, is exempt because it resolves `open-webui` through Docker DNS.

#### Scenario: Overlay setting omitted

- **WHEN** the host policy exists but the resolved OCU service environment omits it or carries a different value
- **THEN** deployment refuses rather than enabling the development fallback

#### Scenario: Existing protected-bridge containers

- **WHEN** any protected-bridge container has inherited or otherwise incompatible DNS, regardless of state or label, except the Messages ingress label
- **THEN** the check identifies the offender, refuses readiness and preserves existing state
