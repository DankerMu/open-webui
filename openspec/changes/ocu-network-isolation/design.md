# Design

## Context

Parent issue20/D7 requires one dedicated sandbox bridge and no compose attachment. The restart/resurrect endpoints already delegate to launch. The lifecycle decision forbids automatic deletion for migration. User reaffirmed preserving incompatible containers rather than recreating them (issue20 comment5813697898).

Blind spots: existing lifecycle world stubs compose discovery to None, so its bare mocks cannot prove network membership; CI only collects tests/orchestrator and test_auth_guard; the untracked deployment patch introduces SANDBOX_HOST_BIND_IP and targets the creation block being replaced. References: docker_manager.py network helpers/create/launch; tests/orchestrator/test_lifecycle.py and test_sandbox_addressing.py; parent sandbox-network-isolation spec.

## Goals / Non-Goals

Ensure successful network-enabled create/launch uses exactly one provisioned sandbox bridge, with published gateway ports. Preserve existing containers when migration cannot satisfy that contract. Do not provision networks, rewrite overlay files, enforce firewall rules, add retries, or claim real-engine acceptance.

## Decisions

### Configuration and ownership

Use OCU_SANDBOX_NETWORK (default ocu-sandbox) for the deployment-provisioned network. The network must exist, use the bridge driver, not be internal, and expose an unambiguous IPv4 gateway. Reject default bridge/host/none and invalid/missing configuration before creating or changing a container. Deployment issue24 owns provisioning and subnet/gateway pinning; no implicit network creation that could bypass deployment firewall/subnet policy.

Read gateway from current network inspection, without a process cache. Adopt SANDBOX_HOST_BIND_IP from the existing patch: empty selects inspected gateway; nonempty must be a valid IPv4 address equal to that gateway. Publish both existing service ports on (gateway, engine-assigned port). Reject mismatch, never silently bind elsewhere. OCU_SANDBOX_SUBNET remains the auth peer-denial configuration, not an unrelated new network provisioner.

When ENABLE_NETWORK=false, preserve network_disabled and absence of publications; do not attach a bridge. Host-network/loopback address parsing may remain for the existing Podman shared-namespace address contract, but does not authorize a managed launch to bypass the dedicated-bridge invariant.

An existing inspected network-disabled container may launch only while configuration also disables networking; it requires no bridge lookup or publication and performs no network repair. A mismatch between configured and inspected network mode fails without start/unpause or deletion. Never use today's disabled flag to exempt an existing network-enabled container.

### Creation and resolution

Pass the sandbox network on the create call, rather than attaching after start. Meta reconstruction only occurs when the container is already absent and reuses this path. Delete compose discovery/cache/only-used orchestrator-name configuration and compose attach branches, including the unused MCP import. Remove the caller-free deprecated CDP address alias after checking references.

Service resolution uses published host address and assigned host port, never a sandbox IP, compose lookup or network mutation. Preserve published-address parsing for existing host-netns/loopback fixtures; concrete gateway bindings are returned as reported by the engine. Missing publication returns unavailable, not an IP fallback.

A running winner adopted after a create-name conflict is subject to the same existing-container checks. Adopt only if compatible with the configured mode: for enabled networking, all immutable gateway bindings and one current desired membership; for disabled networking, inspected disabled networking and no publications. Otherwise fail without live mutation or deletion.

### Existing containers and launch

Inside the existing per-chat lifecycle transaction, inspect desired network and immutable port bindings before any start/unpause or membership mutation. Missing/wrong gateway binding is a typed launch failure, with container, metadata and workspace preserved. Do not delete, rename, recreate, or claim success. Already-running launch requests that are incompatible also fail without disrupting the running process.

For stopped compatible containers, replace dead/foreign membership with the desired sandbox bridge without deletion. Compare network IDs as well as names to detect network recreation. Remove foreign memberships before starting; verify exactly one desired live network afterward. A repair error is a typed failure, never swallowed into success. No live-container network migration: running/paused/restarting containers with mismatched membership fail without mutation; the operator must stop them first. Compatible already-running/paused paths preserve the existing lifecycle behavior.

Pre-start binding compatibility reads immutable HostConfig.PortBindings, not transient NetworkSettings.Ports. Both service ports require entries and every entry's HostIp must equal the inspected gateway; a dynamic HostPort not yet assigned is valid. Reject mixed gateway/wildcard entries and a wrong binding for either service. After running, address resolution reads assigned runtime publications.

Same-gateway network recreation can be repaired non-destructively. Changed-gateway or legacy wildcard bindings require operator migration because Docker cannot update existing port bindings. This explicitly qualifies the deferred issue36 network-recreation scenario: compatible repair succeeds; incompatible launch fails and preserves the container.

### Evidence

Extend reusable stateful fake-engine behavior to track create configuration, membership changes, network IDs and published ports. Exercise actual create, stop-launch, restart alias and absent-container meta reconstruction. Show RED against unmodified source; merely disabling compose discovery is not an oracle. Tests belong in tests/orchestrator/test_network_membership.py and existing affected test files, with no CI change. Parent Python3.12 suite and a direct no-Docker lifecycle smoke provide merge evidence. Real inspect, cross-bridge CDP/tty reachability and firewall reply-path checks remain issue36.

## Risks / Trade-offs

- Provisioned bridge required → deployment must create it before use; failure remains explicit.
- Legacy incompatible containers cannot launch automatically → preserve writable layers and require operator migration, per user decision.
- Port-binding patch duplicates native configuration → issue24 retires its application; do not edit user untracked files here.
- Fake engine cannot prove DNAT or firewall behavior → consolidated Docker gate remains mandatory.

## Migration Plan

Deploy issue24 provisions a named non-internal bridge and matching auth subnet, supplies network/bind configuration and removes the obsolete code patch. Stop legacy containers before non-destructive membership repair. Incompatible immutable bindings require explicit operator-controlled migration. Rollback is a pinned image/config rollback, never automatic container deletion.
