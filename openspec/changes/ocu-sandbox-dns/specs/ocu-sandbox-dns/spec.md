# Spec Delta

## Purpose

Constrain sandbox DNS upstream configuration to the deployment's explicit egress policy while preserving existing containers, explicit lifecycle operations and internal service-name resolution.

## ADDED Requirements

### Requirement: Explicit production DNS policy

Production deployment SHALL require `OCU_SANDBOX_DNS` presence and preserve explicit empty. Nonempty policy SHALL be an ordered list of one to three unique canonical IPv4 resolver addresses. Invalid syntax, empty interior entries or unsupported families SHALL fail configuration. Each resolver SHALL belong to the existing egress allowlist and remain outside control-plane and metadata hard denies. Runtime without a configured policy SHALL preserve non-policy development behavior; a production overlay SHALL NOT silently enter that mode.

#### Scenario: Required versus explicitly empty

- **WHEN** production DNS configuration is missing
- **THEN** deployment fails before service starts
- **WHEN** it is explicitly empty
- **THEN** network-enabled sandboxes receive the explicit nonempty Docker DNS override `127.0.0.11`, disabling external forwarding rather than inheriting host resolvers

#### Scenario: Destination disagreement

- **WHEN** a configured resolver is unlisted or protected, even under a broad allowlist
- **THEN** deployment refuses and does not start services

### Requirement: Immutable ordered DNS compatibility

Policy-managed network-enabled sandbox create and metadata recreate SHALL receive the current effective ordered DNS list. Before start, unpause, running reuse or conflict adoption, inspected `HostConfig.Dns` SHALL equal that list after canonical validation. Missing, empty or reordered DNS SHALL be incompatible. Refusal SHALL preserve the container, metadata and data, and SHALL precede membership repair or lifecycle mutation. Disabled-network behavior and explicit launch requirements SHALL remain unchanged.

#### Scenario: Running or stopped mismatch

- **WHEN** an existing running, stopped or paused sandbox has incompatible DNS
- **THEN** tool reuse of a running sandbox and launch of a running, stopped or paused sandbox return an explicit compatibility error without start, unpause, network repair or deletion
- **AND** tool requests for non-running sandboxes retain the existing SandboxStopped behavior without implicit launch

#### Scenario: Compatible recreation and adoption

- **WHEN** a compatible existing sandbox is launched, or metadata permits creation of an absent sandbox
- **THEN** the current DNS policy is preserved and existing lifecycle success conditions still apply
- **AND** a create-conflict winner is adopted only if its DNS is compatible

#### Scenario: Disabled networking and development mode

- **WHEN** sandbox networking is disabled
- **THEN** creation does not send custom DNS and existing disabled-mode behavior is preserved
- **WHEN** runtime DNS policy is absent outside the production overlay
- **THEN** existing non-policy development behavior is unchanged

### Requirement: Read-only deployment readiness

Before firewall installation and service starts, deployment SHALL verify policy and resolved OCU environment agreement and inspect all containers assigned to the protected bridge, including running, stopped and unlabelled containers. Missing or mismatched resolved DNS settings, incompatible existing DNS and uninspectable required state SHALL fail explicitly with the relevant identity. The check SHALL NOT stop, delete, disconnect or recreate containers. Containers demonstrably on other networks SHALL not acquire this DNS compatibility requirement.

#### Scenario: Overlay setting omitted

- **WHEN** the host policy exists but the resolved OCU service environment omits it or carries a different value
- **THEN** deployment refuses rather than enabling the development fallback

#### Scenario: Existing protected-bridge containers

- **WHEN** any protected-bridge container has inherited or otherwise incompatible DNS, regardless of state or label
- **THEN** the check identifies the offender, refuses readiness and preserves existing state

### Requirement: Honest routing acceptance

The implementation SHALL preserve embedded service-name resolution and legitimate control-initiated CDP/ttyd operations. Source/native/fake evidence SHALL be distinguished from real-engine routing acceptance. Final issue36 SHALL inspect created and recreated DNS settings and exercise namespace-originated allowed resolver traffic, blocked non-allowlisted lookup, empty-policy external failure and internal resolution; `127.0.0.11` in resolv.conf alone SHALL NOT count as upstream proof.

#### Scenario: Development evidence only

- **WHEN** lifecycle and deployment tests pass without a real engine
- **THEN** development may be accepted, but real DNS routing remains explicitly unverified until issue36
