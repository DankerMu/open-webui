# Spec Delta

## Purpose

Provision a private, current overlay runtime configuration and preserve workspace data when the deployment retention guard stops an overage sandbox.

## ADDED Requirements

### Requirement: Stop-only retention

The retention guard SHALL stop managed running sandboxes whose continuous runtime reaches the configured maximum and SHALL NOT delete containers, volumes, chat directories, images or caches. Stopped workspaces SHALL require the existing explicit launch operation rather than implicit MCP restart.

#### Scenario: Maximum runtime boundary

- **WHEN** a managed running sandbox reaches168hours under the default policy
- **THEN** the guard stops it with container identity, volumes and directory contents preserved
- **AND** younger or unmanaged containers are not stopped

#### Scenario: Invalid retention input

- **WHEN** the configured maximum age is not a non-negative integer
- **THEN** the guard exits nonzero without stopping any container

### Requirement: Current deployment configuration

Bootstrap SHALL require an explicit source commit matching the selected checkout and explicit runtime image references instead of selecting historical source or upstream WebUI defaults. Generated configuration SHALL supply the existing proxy-only deployment entrypoint with distinct control and sandbox topology, correct sandbox gateway binding, consistent public origin/base, internal auth endpoint and shared internal token. OCU SHALL receive `OCU_PUBLIC_PREFIX=/ocu` and `OCU_SANDBOX_NO_AUTOSTART=1` through its effective service environment. The egress allowlist SHALL be explicit, preserve empty as deny-all and use the existing IPv4/CIDR validation contract.

#### Scenario: Bootstrap consumed by deployment

- **WHEN** the operator supplies valid source, image, origin and egress inputs
- **THEN** generated configuration satisfies deployment preflight and delivers the same internal token to WebUI, OCU and proxy
- **AND** `PUBLIC_BASE_URL` is the valid HTTP(S) origin without a trailing slash plus `/ocu`, and `OCU_WEBUI_AUTH_URL` is `http://open-webui:8080/api/v1/ocu/auth`
- **AND** OCU receives the prefix and no-autostart settings without a source patch

#### Scenario: Missing or conflicting input

- **WHEN** required input is absent, the source SHA differs, or the allowlist is malformed
- **THEN** bootstrap fails nonzero without publishing configuration or admin credentials

#### Scenario: Explicit deny-all

- **WHEN** the egress input is explicitly empty
- **THEN** bootstrap preserves that value rather than substituting public access or omitting the setting

### Requirement: Private non-destructive provisioning

Bootstrap SHALL retain root-only operation, require a protected provider credential file, generate fresh service credentials, and publish runtime/admin outputs with mode0600. It SHALL refuse to overwrite either existing output and SHALL NOT expose generated/provider credentials in logs or deployment version reports. Unsupported values that could inject configuration or executable shell content SHALL be rejected or safely represented for all existing consumers. Temporary credential files SHALL be removed on failure.

#### Scenario: Existing outputs

- **WHEN** either output already exists
- **THEN** bootstrap refuses and preserves both existing files and their contents

#### Scenario: Unsafe or insecure input

- **WHEN** provider credential permissions are not0600 or input cannot be safely represented
- **THEN** bootstrap fails without publishing either output or logging credential values

### Requirement: Patch-free deployment record

The historical `disable-cli-autostart.patch` SHALL be removed and the deployment version record SHALL describe the environment-driven terminal policy rather than claiming that patch is applied. Real container startup and retention evidence SHALL remain explicitly deferred to final issue36 acceptance; DNS issue79 SHALL remain required for full all-egress readiness.

#### Scenario: Deployment provenance

- **WHEN** the version record is produced for the configured deployment
- **THEN** it records the no-autostart environment policy without an obsolete patch claim or credentials
