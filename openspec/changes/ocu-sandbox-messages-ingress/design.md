## Design

Change surface (OCU): `deploy/proxy/` (static ingress config, Dockerfile `COPY`, `.dockerignore`), `deploy/production-like-test/compose.proxy.yml` (new service, entrypoint override), `deploy/firewall/policy.py` (address validation), `deploy/production-like-test/scripts/bootstrap-test.sh`, `deploy/check-ports.sh`, `deploy/check_sandbox_dns.py`, `deploy/up.sh` (restart), `deploy/smoke_deployment.py`, `deploy/release.py` (`SERVICE_IMAGE_VARS`), `deploy/production-like-test/NETWORK-HARDENING.md`, `docs/claude-code-gateway.md`, tests under `deploy/proxy/tests/` and `tests/deploy/`.

Must preserve: see proposal — gateway rendering and tests, `proxy` as the only publisher, sandbox non-membership of the control plane, smoke timeout assertions, egress rule order, rejection of every other service/container on the sandbox bridge by `check-ports.sh` and the DNS check.

Must add/change: the `messages-ingress` service and config; `OCU_SANDBOX_MESSAGES_ADDRESS` validation (up.sh preflight and bootstrap) and bootstrap output; the two narrow check exceptions; restart in `up.sh`; smoke and release coverage; docs including rollback and upgrade steps. Intended change, deployment level only: an allowlist not covering the ingress address fails the preflight and bootstrap; `policy.py` install/check semantics unchanged.

Governing invariant: from the sandbox bridge, the only newly reachable endpoint is `OCU_SANDBOX_MESSAGES_ADDRESS:8080`, which forwards only `POST /api/v1/messages[?…]` and `POST /api/v1/messages/count_tokens[?…]` to WebUI with exactly the allowlisted headers, answers `GET /healthz` locally, and answers everything else 404 locally; every other port, destination and container stays unreachable, and every other container on the bridge keeps the existing checks.

Sibling surfaces:

- Egress policy (`policy.py` allowlist rendering, `deploy/firewall/check.sh`): rendering and install/check unchanged; the new address validator lives in `policy.py` as a separate subcommand called by the `up.sh` preflight and bootstrap only. Egress tests (`tests/deploy/support.py` `DEFAULT_ALLOW`, `test_sandbox_egress_guard.py`, `test_sandbox_egress_faults.py`) unchanged.
- Port/network check (`deploy/check-ports.sh`, `tests/deploy/test_check_ports.py`): narrow exception for exactly `messages-ingress`.
- Sandbox DNS check (`deploy/check_sandbox_dns.py` `inspect_protected_containers`, its tests): label exemption for the ingress only. Sandbox DNS policy (`OCU_SANDBOX_DNS`, `sandbox_dns.py`) unchanged; the base URL uses the IPv4 literal.
- Proxy gateway (`render.py`, `nginx.conf.in`, `routes.json`, `test_render.py`): unchanged.
- `deploy/up.sh` (#612 restart; `COMPOSE_REMOVE_ORPHANS=false` at line 106): restart extended; orphan on rollback documented.
- Smoke (`deploy/smoke_deployment.py` `REQUIRED_RUNNING`, allowlist probe at 574-585 and 631-654, timeout probes): ingress required; egress URL = ingress `/healthz`; two new ingress probes.
- Overlay/packaging tests: `tests/deploy/test_overlay_structure.py` (proxy stack services, line ~297; `resolved_stacks` env needs the new variable), `test_proxy_packaging_copies_only_public_sources` (`PUBLIC_COPY_SOURCES`), `deploy/proxy/.dockerignore`.
- Bootstrap (`bootstrap-test.sh` and its header comment line 12; required-env list in `tests/deploy/test_bootstrap_runtime.py:87`; the empty-allowlist test at 571-574 rewritten to fail naming the variable).
- `up.sh` entry tests (`tests/deploy/test_deploy_entry.py`): environment gains the variable and a covered allowlist; a new case for the preflight failure.
- Smoke deny-all precondition (`smoke_deployment.py:652`, `test_deployment_smoke.py:468`): unchanged, smoke does not call the validator.
- Release (`release.py` `SERVICE_IMAGE_VARS` 72-81, `verify_service_images`): add the service; the proxy image content changes, no new role.
- Recovery (`recovery_resources._require_stack_matches_runtime`): fixed container map intentionally excludes the ingress.
- Sandbox lifecycle (`docker_manager.py`): selects sandboxes by `owui-chat-*` name, never by network membership; unaffected.
- Docs: `NETWORK-HARDENING.md` lines 211-212 (control-plane-only rules), 214 (required env), ~255 (rollback), 336 (upgrade carry-over).

IP allocation: Docker IPAM assigns sandbox addresses from the lowest free address. The documented choice for `OCU_SANDBOX_MESSAGES_ADDRESS` is the highest usable host address of the sandbox subnet (e.g. `.254` in a /24), which a ~20-user host never reaches; if it is taken anyway, Compose fails to start the ingress (loud). Reserving it via `--ip-range` would require recreating the existing network with all sandboxes stopped; not done here. Exit condition: revisit if a host runs more than ~200 sandboxes.

Seams under test:

- The shipped ingress config run by a real nginx through a new self-contained runner in `deploy/proxy/tests/` (pattern of `run-entrypoint-smoke.sh`): it copies the shipped config, replaces the upstream URL `http://open-webui:8080` (asserting it occurs exactly once) with a local stub server it starts, runs nginx on the config's port 8080 (or a replaced listen token, also asserted exactly once), drives requests, and tears everything down. Named in task 2.7.
- `policy.py` validation through `tests/deploy/test_sandbox_egress_guard.py`; `check-ports.sh` through `test_check_ports.py`; DNS check through its harness; overlay/packaging/bootstrap/release/up.sh through their existing tests.

Required evidence:

a. Native runner: `POST /api/v1/messages` and `POST /api/v1/messages/count_tokens?beta=true` reach the stub with method, URI and body intact; each of `Authorization`, `x-api-key`, `Content-Type`, `Accept`, `anthropic-version`, `anthropic-beta`, `User-Agent` arrives; `Cookie`, `X-Forwarded-For`, `X-User-Id`, `X-Chat-Id` and the unlisted `x-stainless-lang` sent by the client do not.
b. Native runner: a stub SSE response written in chunks with delays reaches the client incrementally (first chunk before the last is written).
c. Native runner: `GET /api/v1/messages`, `POST /api/v1/messages/batches`, `POST /api/v1/chats/`, `GET /`, `GET /ocu/x`, `POST /api/v1/auths/signin`, `POST /api/v1/messages/../chats/`, `POST //api/v1/messages`, `POST /api/v1/%6Dessages/../chats` → 404; the stub records zero requests for all of them.
d. Native runner: a 33 MiB body with `Content-Length` and the same body chunked → 413; the stub records zero requests.
e. Native runner: `GET /healthz` → 200, stub records zero requests.
f. `policy.py` address subcommand: missing address; non-IPv4; outside the subnet; equal to the gateway; network address; broadcast address; not covered by the allowlist (including an empty allowlist) → each fails naming `OCU_SANDBOX_MESSAGES_ADDRESS`; a valid address covered by a /32 or by a wider entry passes. `up.sh` runs it before any Compose start (a failing case starts nothing); bootstrap uses it (empty allowlist now fails naming the variable; ingress `/32` passes). Existing egress install/check tests pass unmodified.
g. `check-ports.sh`: the ingress as specified passes; the ingress with `ports`, with a third network, with a different `ipv4_address`, or without the control network fails; any other service on the sandbox network still fails.
h. DNS check: a bridge container labelled `ocu.role=messages-ingress` with non-policy DNS passes; an unlabelled one with the same DNS fails.
i. Compose/overlay: `messages-ingress` uses `OCU_PROXY_IMAGE`, overrides the entrypoint to the shipped config path (which matches the Dockerfile `COPY` and `.dockerignore`), has no `ports`, no secret env, exactly the sandbox (fixed address) and control networks; `proxy` unchanged; `release.py` verifies the new service's image.
j. `up.sh` restarts `messages-ingress` after start; a failing restart exits non-zero naming it.
k. Smoke: `messages-ingress` required running; ingress probes (401 forwarded / 404 local) implemented and unit-tested with the existing smoke test doubles.
l. Orchestrator, acceptance VPS after deploy: `deploy/smoke.sh` passes with `OCU_SMOKE_EGRESS_URL=http://<address>:8080/healthz`; Claude Code in a sandbox with `ANTHROPIC_BASE_URL=http://<address>:8080/api` and a user token completes a Write + Bash task.

Non-goals: terminal env injection (#656); rate limiting; IP reservation; changes to the gateway proxy.

Review focus: path and method matching (no traversal or prefix bypass); exact header allowlist; no secret reaches the ingress; both check exceptions are exact and every other case still fails; validation is single-owner and fail-loud; docs match behaviour, including rollback and upgrade.
