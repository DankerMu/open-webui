## Why

(#655, second slice of #650.) Owner decision (2026-10-27, #650 comment): the sandbox reaches Open WebUI through a dedicated ingress that forwards only the Anthropic Messages endpoints; the host gateway IP is not allowlisted; Claude Code uses the user's own WebUI token.

Sandboxes on `${OCU_SANDBOX_NETWORK}` have no network on the acceptance VPS: `OCU_SANDBOX_EGRESS_ALLOW` is empty, so the egress chain (`deploy/firewall/policy.py` `ipv4_policy_rules`, 243-253) ends in DROP and DNS fails. The allowlist matches destination IPv4 only, not port, so the existing proxy cannot simply join the sandbox network: its 8082 gateway (all of WebUI, `/ocu/*`) and 8083 DocumentServer listeners would become reachable from sandbox code.

Measured 2026-10-27 (#653): Claude Code 2.1.112 from the sandbox image, with `ANTHROPIC_BASE_URL=http://open-webui:8080/api` and a user's WebUI token, completes multi-turn tool tasks through `/api/v1/messages` on `deepseek-flash-guan` and `qwen3.8-27b` (WebUI ≥ 47c2ae7).

## What Changes

In `open-computer-use` (`DankerMu/open-computer-use`):

- A new service `messages-ingress` (container `ocu-test-messages-ingress`, label `ocu.role=messages-ingress`) in `deploy/production-like-test/compose.proxy.yml`, run from the existing `OCU_PROXY_IMAGE` with a static nginx configuration shipped in that image (new file in `deploy/proxy/`, Dockerfile `COPY`, `.dockerignore` allowlist entry). Compose overrides the image entrypoint so `render.py` (which needs `OCU_INTERNAL_TOKEN`) never runs; no new release role.
  - Networks: `${OCU_SANDBOX_NETWORK}` with fixed IPv4 `OCU_SANDBOX_MESSAGES_ADDRESS`, and `${OCU_PRIVATE_NETWORK}` to reach `open-webui:8080`. No published host port.
  - One listener on unprivileged port 8080 (the image runs as `ocu-proxy`, uid 1000). Base URL for Claude Code: `http://<OCU_SANDBOX_MESSAGES_ADDRESS>:8080/api`.
  - `POST` to exactly `/api/v1/messages` or `/api/v1/messages/count_tokens` (any query string) is proxied to `http://open-webui:8080` with the same URI. `GET /healthz` answers 200 locally (deployment smoke and healthcheck; never contacts WebUI). Every other method or path answers 404 locally.
  - Request headers: `proxy_pass_request_headers off`, then exactly `Authorization`, `x-api-key`, `Content-Type`, `Accept`, `anthropic-version`, `anthropic-beta`, `User-Agent` are set from the client request; nothing else is forwarded (in particular `Cookie`, `X-Forwarded-*`, `X-User-*`, `X-Chat-Id`, `x-stainless-*`).
  - Request bodies are buffered with `client_max_body_size 32m` (applies to declared-length and chunked bodies; oversize → 413 before any upstream contact). Responses are not buffered (SSE streams through). Read/send timeouts 600 s.
  - No secrets in its environment (no `OCU_INTERNAL_TOKEN`, no `OCU_WEBUI_ORIGIN`); access log without request headers; pid and temp paths writable by the non-root user.
- Validation, one implementation in `deploy/firewall/policy.py` (it already parses `OCU_SANDBOX_SUBNET`/`OCU_SANDBOX_GATEWAY` and the allowlist): a new function exposed as its own subcommand checks that `OCU_SANDBOX_MESSAGES_ADDRESS` is set, IPv4, inside the sandbox subnet, not the gateway, network or broadcast address, and covered by an `OCU_SANDBOX_EGRESS_ALLOW` entry. It is called only by the `deploy/up.sh` preflight (before any Compose start, next to `check-ports.sh`) and by `deploy/production-like-test/scripts/bootstrap-test.sh` (already imports `firewall.policy`), which also writes the variable. The policy's own install/check paths do not call it, so firewall rule rendering and its tests are untouched.
- Deployment checks learn the single exception:
  - `deploy/check-ports.sh`: exactly the service `messages-ingress` may join the sandbox network, only together with the control network, with no `ports`, and with `ipv4_address` equal to `OCU_SANDBOX_MESSAGES_ADDRESS`; every other service on the sandbox network still fails.
  - `deploy/check_sandbox_dns.py` `inspect_protected_containers`: the container labelled `ocu.role=messages-ingress` is not a sandbox and is exempt from the sandbox DNS policy (it must resolve `open-webui` through Docker DNS); every other container on the bridge is still checked.
- `deploy/up.sh` restarts `messages-ingress` together with `proxy` after start (#612: nginx resolves `open-webui` only at start); failure is non-zero and named.
- Deployment smoke (`deploy/smoke_deployment.py`): `messages-ingress` joins `REQUIRED_RUNNING`; with `OCU_SMOKE_EGRESS_URL=http://<address>:8080/healthz` the existing allowlist probe passes; new sandbox probes: `POST /api/v1/messages/count_tokens` without credentials returns WebUI's 401 (forwarded), `GET /api/v1/chats/` returns the ingress's 404 (local). Existing timeout assertions unchanged.
- Release: `release.py` `SERVICE_IMAGE_VARS` gains `messages-ingress: OCU_PROXY_IMAGE` so release verification covers the new service. `recovery_resources._require_stack_matches_runtime` keeps its fixed map without the ingress on purpose (recovery does not manage it).
- Docs: `NETWORK-HARDENING.md` — required env (line 214), the control-plane-only rules (lines 211-212) with the single ingress exception, rollback (around line 255: remove `ocu-test-messages-ingress` when rolling back to a release without it, because `COMPOSE_REMOVE_ORPHANS=false` leaves it running and the older DNS check would reject it), upgrade carry-over list (line 336: set the new variable and add it to the allowlist); `docs/claude-code-gateway.md` documents the base URL.

In this repo: the fixture, the spec delta and a decision record `docs/decisions/implemented/architecture/2026-10-27-sandbox-messages-ingress.md`.

Must preserve:

- `deploy/proxy/routes.json`, `nginx.conf.in`, `render.py` output and their tests unchanged; the `proxy` service unchanged and still the only publisher (`OCU_PROXY_PORT:8082`, `OCU_OFFICE_PROXY_PORT:8083`).
- Sandboxes are never attached to the control-plane network; the smoke assertions that a sandbox times out on OCU:8081, WebUI:8080, proxy:8082 and the host LAN proxy stay true.
- Egress rule order (REPLY return, control DROP, metadata DROP, allowlist RETURNs, DROP) and `policy.py` install/check behaviour unchanged, including an empty allowlist installing deny-all; the existing egress tests (`tests/deploy/support.py` `DEFAULT_ALLOW`, `test_sandbox_egress_guard.py`, `test_sandbox_egress_faults.py`) stay as they are. Intended change, deployment level only: the `up.sh` preflight and bootstrap now fail when the allowlist does not cover `OCU_SANDBOX_MESSAGES_ADDRESS` (including an empty allowlist), because the ingress is a required part of this overlay. Affected tests are rewritten to the new rule, not deleted: `tests/deploy/test_bootstrap_runtime.py:571-574` (empty allowlist accepted → empty fails naming the variable; plus a passing case with the ingress `/32`), and the `up.sh` entry tests' environment (`tests/deploy/test_deploy_entry.py`) gains the variable and a covered allowlist. Docs with the old wording are updated: `NETWORK-HARDENING.md:214` and the header comment of `bootstrap-test.sh` (line 12). The deployment smoke deny-all precondition (`smoke_deployment.py:652`, `test_deployment_smoke.py:468`) is unchanged because smoke never calls the validator.
- Every non-ingress service on the sandbox network still fails `check-ports.sh`; every non-ingress container on the bridge still gets the DNS check.
- WebUI enforces authentication and model access on `/api/v1/messages`; the ingress adds no identity.

Out of scope: injecting token/model into the terminal (#656); per-user rate limits; binding the existing proxy listeners to control-plane IPs (the proxy does not join the sandbox network); IP reservation on the sandbox network (see design).

## Capabilities

### Modified Capabilities

- `ocu-network-isolation`: one dedicated, path-restricted ingress on the sandbox network.

## Impact

Sandbox processes can call admin-configured models through WebUI as the token's user, and nothing else.

## Triage

```text
Issue type: feature
Fixture level: expanded
Upstream suggested level: absent; expanded: network security boundary, production deploy config, new service
Blast radius: every sandbox; a wrong rule opens WebUI/OCU/DocumentServer or the host to sandbox code, or breaks deployment start
Selected risk packs: Auth / permissions / secrets; Config / project setup; Public API; Resource limits; Release / packaging; Legacy compatibility; Error handling / rollback; Documentation
Evidence floor: native nginx runner for the ingress config; policy, check-ports, DNS-check, overlay, packaging, bootstrap, release and up.sh tests; OCU unit command green; deployment smoke on the acceptance VPS after deploy
design.md: present
```
