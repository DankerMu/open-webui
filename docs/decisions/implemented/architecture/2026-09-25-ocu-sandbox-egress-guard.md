---
id: 2026-09-25-ocu-sandbox-egress-guard
title: Explicit IPv4 destination allowlist for sandbox host egress
kind: architecture
status: implemented
date: 2026-09-25
supersedes: none
references: 2026-09-25-ocu-proxy-only-compose-topology, 2026-09-24-ocu-sandbox-network-membership, 2026-09-20-lan-topology-external-reverse-proxy, issue-25, issue-79, issue-36
---

# Explicit IPv4 destination allowlist for sandbox host egress

## Problem

Sandbox membership on a dedicated bridge and proxy-only publications do not stop sandbox-initiated connections to public, company or host addresses. Docker `DOCKER-USER` is FORWARD-only and post-DNAT, so host-local services and IPv6 remain outside that hook. Source-address filters can be spoofed. Control-initiated CDP/ttyd replies travel from the sandbox toward the control-plane subnet and must not be dropped with other control-plane traffic.

## Decision

Deployment requires `OCU_SANDBOX_EGRESS_ALLOW`, a comma-separated IPv4 address or canonical CIDR list. Unset is a configuration error; an explicitly empty value denies all new sandbox-initiated IP traffic. Invalid or empty interior entries fail without changing firewall state. Allowlist RETURN only exempts this guard; later host policy may still deny.

`deploy/up.sh` distinguishes unset from empty, then after network provisioning and before any Compose start runs `deploy/firewall/docker-user-rules.sh` and `deploy/firewall/check.sh` through `run_owned`, including when the sandbox bridge already exists.

The installer resolves the protected bridge from Docker network inspect (`OCU_SANDBOX_NETWORK`, network ID, explicit `com.docker.network.bridge.name` or `br-<first12id>`), validates the non-internal IPv4 IPAM contract, and binds hooks to that ingress interface. One owned IPv4 chain `OCU-SANDBOX-EGRESS` is reached first from `DOCKER-USER` and `INPUT`. Ordered rules: conntrack `ESTABLISHED,RELATED` in `REPLY` direction RETURN; control-plane subnet DROP; metadata `169.254.169.254/32` DROP; one RETURN per allowlisted destination; unconditional DROP. ORIGINAL-direction established flows stay subject to the current allowlist. IPv6 uses owned chain `OCU-SANDBOX-EGRESS6` first from INPUT and FORWARD, dropping all sandbox ingress. Missing `DOCKER-USER`, a bypassed FORWARD hook, native nftables backend, rootless Docker, or disabled bridge-netfilter sysctls fail named rather than creating a placeholder or converting the backend.

Installation owns only reserved chains and jump rules. Cooperating installer/checker processes serialize on a private lock at `OCU_SANDBOX_EGRESS_LOCK` when set, otherwise `/run/ocu-sandbox-egress/ocu-sandbox-egress.lock`. The lock directory and file must be owned by the installing euid, regular (not a symlink), and not group/world-writable; open uses `O_NOFOLLOW` and `fchmod` on the held fd. Owned chains are populated with `iptables-restore --noflush` / IPv6 equivalent. Mutation and restore tools use bounded xtables waits; `iptables-save`/`ip6tables-save` do not. Shared chains are never flushed. Existing managed hooks for a different bridge refuse implicit migration before any write.

The checker is read-only apart from lock ownership and inspects normalized ordered policy plus unique first hooks.

## Alternatives considered

- **Default public-internet grant with only control-plane DROP** — rejected by the operator; unlisted public, company and host destinations must fail closed.
- **Source-subnet matching instead of ingress-interface hooks** — forged source addresses would bypass the guard.
- **ACCEPT for allowlisted destinations** — would skip later host policy; RETURN keeps downstream rules in force.
- **ESTABLISHED original-direction exception** — a tightened allowlist would keep an unauthorized sandbox-originated flow.
- **Creating a placeholder DOCKER-USER chain** — hides a missing Docker forwarding hook and claims enforcement the kernel path does not have.
- **Domain, DNS-proxy or TLS inspection in this slice** — out of scope; inherited host-namespace DNS remains issue 79.

## Consequences

The host must provide Linux Docker with the iptables interface (including its nft frontend), reachable `DOCKER-USER`, IPv6 iptables, and bridge-netfilter sysctls. Host firewall reset or reboot invalidates readiness until the next deployment reconciliation; there is no continuous enforcement agent. Configuration changes may stop existing sandbox egress immediately and never delete containers or networks.

This guard does not close Docker's inherited host-namespace DNS path. Issue 79 remains mandatory before claiming full all-egress readiness; issues 27 and 36 retain that dependency. Real iptables/ip6tables inspection, forwarded and host-local packets, CDP/ttyd replies, and DNS coverage are recorded as required evidence for issue 36 and are not claimed here.
