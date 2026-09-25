---
id: 2026-09-25-ocu-proxy-only-compose-topology
title: Proxy-only Compose entry with independent sandbox bridge
kind: architecture
status: implemented
date: 2026-09-25
supersedes: none
references: 2026-09-20-lan-topology-external-reverse-proxy, 2026-09-24-ocu-sandbox-network-membership, 2026-09-25-ocu-cookie-gateway-and-paired-smoke, 2026-09-25-ocu-sandbox-egress-guard, issue-24
---

# Proxy-only Compose entry with independent sandbox bridge

## Problem

Application overlays that publish WebUI or OCU directly bypass the cookie gateway, even if the host bind is loopback-only. A sandbox bridge managed by Compose can disappear with the application project, and reusing the control-plane gateway for sandbox port bindings conflicts with OCU's native network check. The three separate Compose stacks need a single fail-closed entry before any service starts.

## Decision

The production-like core and WebUI overrides use `ports: !override []`; only the separate proxy service publishes TCP 8082 through its configured host port. All services use one named control-plane bridge; no control-plane service joins the sandbox bridge. OCU receives the dedicated bridge's name, subnet and gateway from required deployment variables. The gateway also sets `SANDBOX_HOST_BIND_IP`.

`deploy/up.sh` resolves all three Compose stacks to private JSON before start, using the checkout root as the core/WebUI project directory and the overlay directory for proxy so `../proxy` stays valid. `deploy/check-ports.sh` checks the complete resolved service set for non-proxy publications, network-mode bypasses including Docker `bridge`, sandbox membership, proxy mapping and application reachability. Startup executes the already-checked documents rather than rereading mutable YAML, and forces `COMPOSE_REMOVE_ORPHANS=false` plus an empty `COMPOSE_PROFILES` so sibling stacks survive and the cleanup profile cannot activate. `deploy/provision-networks.sh` validates both IPv4 topologies and inspects existing bridges; it creates only a missing sandbox bridge and validates the result after creation or a concurrent-create conflict. It neither deletes nor migrates an incompatible network. Application stacks start before the proxy because nginx resolves their service names when the canonical renderer validates its configuration. Open WebUI receives `ENABLE_OCU_WORKSPACE=true` and `OCU_INTERNAL_URL=http://computer-use-server:8081` in addition to the internal token.

The proxy image copies only the renderer, route table, template and entrypoint. One unprivileged identity renders a private runtime/config and runs native nginx in the foreground. The route and credential policies remain owned by the existing renderer and gateway decisions.

The adopted initializer writes its completion marker only after required configuration and model persistence succeed. Public model grants require a confirmed saved model; an HTTP-success response without the expected model is not persistence evidence. The canonical initializer owns this check so the deployment wrapper cannot publish a minimal model after a failed create or update.

## Alternatives considered

- **Empty list without `!override`** — Compose may merge rather than remove a base publication.
- **A dummy Compose service to create the sandbox bridge** — couples sandbox persistence to application teardown and joins an unnecessary control-plane container to the bridge.
- **The control-plane gateway as sandbox bind address** — disagrees with OCU's inspected dedicated bridge and its immutable port-binding checks.
- **Automatic replacement of incompatible bridges or sandboxes** — destroys operator state instead of requiring a deliberate migration.
- **A second proxy route policy or direct OCU/WebUI rollback listener** — bypasses the reviewed cookie gateway.

## Consequences

Network creation races must end in a fresh compatibility inspection. Any preflight error prevents service starts and removes the private resolved JSON; a later application start failure is not rolled back destructively. Sandbox destination policy is owned by `2026-09-25-ocu-sandbox-egress-guard`; bootstrap/runtime variable adoption by issue26, overlay runtime smoke by issue27, image delivery by issue33, backup inventory by issue34, DNS closure by issue79, and actual Compose/build/start/bridge/publication/kernel acceptance by issue36. This decision does not establish full all-egress closure or real-engine evidence.
