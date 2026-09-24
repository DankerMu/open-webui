# ocu-network-isolation Specification

## Purpose

Keep managed sandboxes off the control-plane network while preserving existing container state during explicit network migration and resolving browser services through published gateway ports.

## Requirements

### Requirement: Dedicated membership at successful lifecycle boundaries

A network-enabled sandbox SHALL use exactly one provisioned non-internal sandbox bridge after successful creation or explicit launch. The orchestrator SHALL NOT attach a sandbox to the control-plane compose network. For network-enabled operations, missing or incompatible network configuration SHALL fail explicitly before creation or mutation. Network-disabled creation SHALL remain disabled without port publication.

#### Scenario: Creation and absent-container reconstruction

- **WHEN** networking is enabled and a new chat creates a sandbox or launch reconstructs an already-absent container from metadata
- **THEN** creation selects only the configured sandbox bridge and publishes both browser service ports on its gateway with engine-assigned host ports

#### Scenario: Stop and launch through either entrypoint

- **WHEN** networking is enabled and a compatible sandbox is stopped and launched through the internal launch endpoint or restart alias
- **THEN** successful launch leaves exactly one current sandbox-bridge membership and preserves container identity and workspace data

#### Scenario: Invalid deployment configuration

- **WHEN** networking is enabled and the configured network is missing, internal, not a dedicated bridge, has no unambiguous IPv4 gateway, or the explicit bind address differs from that gateway
- **THEN** the operation fails explicitly without creating or mutating a sandbox

#### Scenario: Disabled sandbox relaunch and configuration mismatch

- **WHEN** an inspected network-disabled sandbox is stopped and launched while networking remains disabled
- **THEN** launch preserves disabled networking without bridge lookup, publication or membership repair
- **WHEN** configured networking differs from the existing container's inspected mode
- **THEN** launch fails without start, unpause, deletion or recreation

#### Scenario: Creation conflict adopts only a compatible winner

- **WHEN** container creation conflicts with an already-running container of the same name
- **THEN** adoption succeeds only after verifying compatibility with the configured mode: immutable bindings and exactly one current sandbox-bridge membership when enabled, or inspected disabled networking when disabled; incompatibility fails without live mutation or deletion

### Requirement: Non-destructive migration and explicit incompatibility

Existing containers SHALL NOT be deleted or recreated automatically to repair network membership or immutable port bindings. Compatible stopped containers MAY have membership repaired before launch; success SHALL require verified desired membership. Incompatible bindings, live membership mismatch or repair failure SHALL produce a typed launch failure without deleting the container, metadata or workspace, and SHALL NOT start or unpause it.

#### Scenario: Same-gateway bridge recreation

- **WHEN** a stopped container references a stale network ID and its published ports still bind the configured gateway
- **THEN** launch can repair membership to the current sandbox bridge without changing container identity and succeeds only after verifying that membership

#### Scenario: Dynamic ports before first start

- **WHEN** a compatible created or stopped container has both immutable service bindings on the gateway but host ports are not yet assigned
- **THEN** the unassigned dynamic port does not prevent launch, and running service resolution uses the assigned runtime port

#### Scenario: Multiple or mismatched service bindings

- **WHEN** either service has a missing immutable binding or any configured binding uses a non-gateway address
- **THEN** launch fails without starting or unpausing even if another binding is compatible

#### Scenario: Changed gateway or legacy wildcard binding

- **WHEN** an existing container's immutable publication cannot satisfy the configured gateway binding
- **THEN** launch reports failure requiring operator migration, without deleting, recreating, starting or unpausing the container

#### Scenario: Live foreign membership

- **WHEN** a running, paused or restarting container has foreign or stale membership
- **THEN** launch fails without live network mutation or deletion and requires operator stop before migration

#### Scenario: Membership repair fails

- **WHEN** a stopped compatible container's network adjustment fails
- **THEN** launch does not start it or report success and preserves its container identity, metadata and workspace

### Requirement: Published service addressing without compose fallback

CDP and ttyd service resolution SHALL use published host address and assigned host port, with no compose-network discovery, direct-container-IP fallback or network mutation. Concrete gateway bindings SHALL resolve to gateway plus published port. Existing host-network/shared-namespace loopback parsing SHALL remain supported as address parsing, not as an exception to managed-launch isolation.

#### Scenario: Gateway publication

- **WHEN** a running sandbox reports a concrete gateway binding for CDP or ttyd
- **THEN** resolution returns that gateway and assigned host port, not the container port or container IP

#### Scenario: Missing publication

- **WHEN** a non-host-network sandbox has no published mapping for the requested service
- **THEN** resolution reports unavailable even when a compose or sandbox container IP exists
