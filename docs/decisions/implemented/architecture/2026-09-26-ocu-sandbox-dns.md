---
id: 2026-09-26-ocu-sandbox-dns
title: Explicit sandbox DNS with immutable ordered compatibility
kind: architecture
status: implemented
date: 2026-09-26
supersedes: none
references: 2026-09-24-ocu-sandbox-network-membership, 2026-09-25-ocu-sandbox-egress-guard, 2026-09-26-ocu-private-runtime-provisioning, issue-79, issue-36
---

# Explicit sandbox DNS with immutable ordered compatibility

## Problem

Docker-inherited DNS servers can forward from the host namespace, outside the ingress-interface egress guard. The embedded resolver address in resolv.conf does not identify the actual upstream or its namespace.

## Decision

Production requires `OCU_SANDBOX_DNS`, a comma-separated ordered list of one to three unique IPv4 resolver addresses. Explicit empty becomes the nonempty Docker override `["127.0.0.11"]`; absence remains optional development behavior only outside the production overlay. The shared stdlib-only server DNS module owns parsing, effective values and ordered compatibility, and is explicitly copied into the server image. Deployment imports it rather than duplicating the policy.

The empty override uses the embedded resolver's self-address filtering: inspected Moby source applies overrides only for nonempty lists, marks overridden upstreams for sandbox-namespace dialing, and filters its own listen address out of external servers. This source-grounded mechanism requires final pinned-engine acceptance; no fallback to inherited DNS is allowed.

Deployment reuses the existing egress parser and hard-deny authority, checks each resolver against the allowed destinations and excludes control-plane/metadata addresses. It also verifies the resolved OCU environment matches the host policy. Required-but-empty Compose interpolation preserves the lockdown mode while omission refuses deployment.

Runtime compares inspected `HostConfig.Dns` to the effective ordered policy before running reuse, conflict adoption, start, unpause or membership repair. New and metadata-recreated containers use current server policy and are inspected before start. Incompatible containers are preserved and explicitly refused; stopped tool requests retain SandboxStopped. Network-disabled creation sends no DNS override. Both packaged process preflight and direct lifespan validate syntax without constructing Docker clients.

After bridge provisioning and before firewall installation, the read-only deployment check enumerates all containers, including stopped and unlabelled ones, then inspects protected membership by network name or ID. Unknown required state or incompatible DNS blocks readiness without lifecycle or firewall mutation. This is point-in-time readiness, not continuous control over a Docker administrator.

## Alternatives considered

- **Empty Docker DNS list** — selects inheritance rather than explicit lockdown.
- **127.0.0.1 override** — forwarding failure depends on whether a process serves port53 inside the sandbox; self-address filtering avoids that dependency.
- **Unspecified address or public fallback** — unsupported routing assumptions or an implicit grant outside the explicit policy.
- **Unordered compatibility** — Moby preserves and consumes resolver order, so set equality accepts behavioral drift.
- **Automatic recreation of incompatible containers** — violates preservation and hides operator migration consequences.

## Consequences

Existing inherited-DNS sandboxes require deliberate operator migration while preserving needed data. The implementation does not stop or delete them. Real Compose empty-string JSON, SDK-to-HostConfig mapping, engine acceptance of the self-address override, no external fallback, sandbox-originated resolver traffic, embedded service-name resolution and CDP/ttyd behavior remain issue36 acceptance. Native/fake evidence proves configuration and refusal, not real packet isolation.
