---
id: 2026-09-24-ocu-sandbox-network-membership
title: Dedicated sandbox membership with non-destructive migration
kind: architecture
status: implemented
date: 2026-09-24
supersedes: none
references: 2026-09-22-ocu-lifecycle-lock-and-launch-semantics, 2026-09-20-lan-topology-external-reverse-proxy, 2026-09-25-ocu-proxy-only-compose-topology, 2026-09-25-ocu-sandbox-egress-guard, issue-20
---

# Dedicated sandbox membership with non-destructive migration

## Problem

Compose-network attachment defeats sandbox separation. Network names can be reused after deployment recreation, and existing container port bindings cannot be changed by reconnecting a network. Preserving mounted workspace data alone does not preserve the container writable layer.

## Decision

Deployment provisions the non-internal bridge named by OCU_SANDBOX_NETWORK, default ocu-sandbox. OCU inspects its current ID and unambiguous IPv4 gateway instead of creating or caching a network. SANDBOX_HOST_BIND_IP is optional; when set it must equal the inspected gateway. Both service ports publish on that gateway with engine-assigned host ports. Creation pins the inspected network ID and checks membership before starting.

Existing containers are preserved. Launch checks inspected enabled/disabled mode and every immutable binding for both services before starting or unpausing. Compatible stopped containers can repair membership to the current bridge ID; gateway is revalidated after network refresh. A changed gateway, incompatible binding, live membership mismatch or failed repair produces a typed failure requiring operator action, never automatic deletion or reconstruction. A creation-conflict winner undergoes the same compatibility checks before adoption. Reconstruction from metadata remains limited to an already-absent container.

Service addressing reads published host address and assigned port without compose discovery, direct-container-IP fallback or network mutation. Shared-namespace host/loopback parsing remains an address-parser compatibility behavior, not a managed-launch isolation exception.

## Alternatives considered

- **Automatic replacement of incompatible stopped containers** — rejected by the user; it loses writable-layer changes even when workspace mounts survive.
- **Network-name-only creation** — can select a different network between inspection and creation.
- **Editing cached inspect attributes as repair** — changes no engine state; reload must establish membership from the engine.
- **Implicit bridge provisioning in OCU** — duplicates deployment subnet and firewall ownership.

## Consequences

Deployment must provision the bridge and retire the old port-binding code patch. Legacy immutable bindings may require explicit operator migration. Same-gateway membership repair is supported when the engine can detach the old endpoint; missing stale network objects fail explicitly rather than claiming repair. Fake-engine tests separate authoritative membership from inspect snapshots. Destination allowlist enforcement is owned by `2026-09-25-ocu-sandbox-egress-guard`; Docker reachability, packet traversal and DNS remain part of consolidated acceptance. The lifecycle record's preservation contract remains in force.
