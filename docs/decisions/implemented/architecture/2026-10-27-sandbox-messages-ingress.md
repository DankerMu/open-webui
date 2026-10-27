---
id: 2026-10-27-sandbox-messages-ingress
title: A path-restricted Messages ingress is the only new endpoint on the sandbox network
kind: architecture
status: implemented
date: 2026-10-27
supersedes: none
references: DankerMu/open-webui#655, DankerMu/open-webui#650, ocu-sandbox-messages-ingress, 2026-09-25-ocu-proxy-only-compose-topology, 2026-09-25-ocu-sandbox-egress-guard, 2026-09-26-ocu-sandbox-dns, 2026-09-24-ocu-sandbox-network-membership
---

# A path-restricted Messages ingress is the only new endpoint on the sandbox network

## Problem

Claude Code inside a sandbox needs a model endpoint. On the acceptance VPS the sandbox has none: `OCU_SANDBOX_EGRESS_ALLOW` is empty, so the egress chain ends in DROP. Open WebUI already serves the Anthropic Messages API at `/api/v1/messages`, authenticated by the user's own token (#653). Every other Open WebUI path, the OCU gateway (`/ocu/*`) and DocumentServer must stay unreachable from sandbox code.

The egress allowlist matches destination IPv4 only, not port. Any container that joins the sandbox network and is allowlisted exposes every listener it has. The existing proxy listens on 8082 (all of Open WebUI and `/ocu/*`) and 8083 (DocumentServer), so it cannot be the target.

## Decision

Owner decision on #650 (2026-10-27): sandboxes reach Open WebUI only through a dedicated ingress that forwards the Messages endpoints, the host gateway is not allowlisted, and Claude Code uses the user's own Open WebUI token.

- **One new Compose service.** `messages-ingress` (container `ocu-test-messages-ingress`, label `ocu.role=messages-ingress`) runs the existing `OCU_PROXY_IMAGE` with a static nginx configuration shipped in that image (`deploy/proxy/messages-ingress.conf`). Compose overrides the entrypoint, so the token-bearing `render.py` never runs. The service has no secret in its environment, publishes no host port, and joins the control-plane network plus `${OCU_SANDBOX_NETWORK}` at the fixed address `OCU_SANDBOX_MESSAGES_ADDRESS`, port 8080.
- **Path, method and header allowlist.** Only `POST /api/v1/messages` and `POST /api/v1/messages/count_tokens`, with any query, are forwarded to `http://open-webui:8080` with the same URI. The match runs on the raw request line, so dot segments, doubled slashes and percent-encoded paths get 404. `GET /healthz` answers 200 locally. Everything else answers 404 locally. Request headers are dropped except `Authorization`, `x-api-key`, `Content-Type`, `Accept`, `anthropic-version`, `anthropic-beta` and `User-Agent`. Bodies are buffered up to 32 MiB, declared or chunked; larger bodies get 413 before any upstream contact. Responses stream unbuffered with 600 s read/send timeouts. The access log records no request header.
- **One validator.** `deploy/firewall/policy.py messages-address` checks that the address is IPv4, inside `OCU_SANDBOX_SUBNET`, not its network, broadcast or gateway address, and covered by an `OCU_SANDBOX_EGRESS_ALLOW` entry. `deploy/up.sh` runs it before `check-ports.sh` and any Compose start; `bootstrap-test.sh` runs it before writing `runtime.env`, defaulting the address to `172.31.0.254`. The firewall's own install and check paths do not call it, so an empty allowlist still installs deny-all.
- **Two exact check exceptions.** `deploy/check-ports.sh` lets exactly the service named `messages-ingress` join the sandbox network, only together with the control-plane network, without ports, at `ipv4_address == OCU_SANDBOX_MESSAGES_ADDRESS`. `deploy/check_sandbox_dns.py` skips the container whose `Config.Labels` carries `ocu.role=messages-ingress`, because it must resolve `open-webui` through Docker DNS. Every other service and container keeps the existing checks.
- **Lifecycle.** `deploy/up.sh` restarts `proxy` and `messages-ingress` together after start, because nginx resolves `open-webui` only at start (#612). Release verification checks the service's image against the proxy role. The deployment smoke requires it to run and probes it from a sandbox: unauthenticated `count_tokens` must return Open WebUI's 401, `GET /api/v1/chats/` the ingress's own 404.

## Alternatives considered

- **Allowlist the sandbox gateway (host) address** — rejected by the owner on #650. The host's published ports (`OCU_PROXY_PORT`, `OCU_OFFICE_PROXY_PORT`) would become reachable from sandbox code, and with them all of Open WebUI, `/ocu/*` and DocumentServer.
- **Attach the existing proxy to the sandbox network** — the allowlist cannot select a port, so its 8082 and 8083 listeners would be reachable. Binding those listeners to control-plane addresses only changes the gateway's rendered configuration and its reviewed tests for a sibling concern.
- **A new image role for the ingress** — adds a release role, inventory field, archive and verification path for an nginx configuration the proxy image can carry as one more file. The proxy image already runs unprivileged nginx.
- **Reserve the address with `--ip-range` on the sandbox network** — needs the existing network recreated with every sandbox stopped. The highest usable host address is never reached by IPAM on a host of about 20 users; if it is taken, Compose fails to start the ingress, which is loud. Revisit when a host runs more than about 200 sandboxes.
- **Validate the address inside the firewall install/check path** — would change the egress rule rendering and its tests and make the guard depend on an unrelated service. The separate subcommand keeps one implementation without touching install/check.

## Consequences

- Sandbox processes can call admin-configured models through Open WebUI as the token's user, and nothing else. Open WebUI's authentication and model access are the only identity check; the ingress mints none. Per-user rate limits do not exist yet.
- An allowlist that does not cover the ingress address, including an empty one, now fails the `up.sh` preflight and bootstrap. Existing deployments must set `OCU_SANDBOX_MESSAGES_ADDRESS` and add its `/32` to `OCU_SANDBOX_EGRESS_ALLOW` before upgrading; the OCU hardening guide carries the step.
- Rollback to a release without the ingress leaves `ocu-test-messages-ingress` running, because `COMPOSE_REMOVE_ORPHANS=false`, and that release's sandbox DNS check rejects it. The rollback procedure removes the container first.
- `recovery_resources._require_stack_matches_runtime` keeps its fixed container map without the ingress: recovery neither backs it up nor restarts it.
- The proxy image content changes; any release built from this commit carries the ingress configuration.
- Native nginx and fake-engine tests prove the configuration and the checks. Packet-level reachability and a real Claude Code task from a sandbox are acceptance-VPS evidence after deployment.
