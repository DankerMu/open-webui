## Why

#442: on Docker Desktop the engine accepts the gateway-IP dynamic publication OCU requests for a sandbox's CDP (`9222`) and ttyd (`7681`) ports, the sandbox runs healthy, but `NetworkSettings.Ports` never receives a host port. `get_container_service_address` reads assigned ports only, returns `None`, and `/browser/{chat_id}/json` answers `404 Container not found or not running` for a container that is running. Paths are in the sibling `open-computer-use` checkout at `origin/main` `cec0a91` (the later `c0b9566` changed only the PR template).

- Publication request: `computer-use-server/docker_manager.py:1219` publishes `{f"{port}/tcp": (gateway, None)}` for both ports on the inspected sandbox-bridge gateway. Launch compatibility checks the immutable `HostConfig.PortBindings` (`:830-840`), which do carry the gateway, so launch succeeds on Desktop.
- Lookup: `_published_address` (`:971-990`) returns the assigned `NetworkSettings.Ports` entry or `None`; `get_container_service_address` (`:993-1011`) returns `None` for absent, not running, unassigned and every exception alike.
- Routes: `app.py` `browser_status` (`:953-978`) answers `{"active": false, "pages": []}`, `browser_cdp_json` (`:981-997`) and `browser_cdp_json_version` (`:1000-1016`) answer 404, `terminal_status` (`:1073-1097`) falls through to the stopped/meta checks and reports `meta_exists` for a running container; the WS proxies (`:1028`, `:1303`) pass the lookup to `ws_recheck.py:307-316`, which closes `1011` on an exception and `1008` on `None`.
- Probe on this machine, 2026-10-20 (Docker Desktop Engine `29.1.3`, `linux/arm64`, API 1.52, kernel `6.12.54-linuxkit`, `overlayfs` with `io.containerd.snapshotter.v1`; host Darwin 25.6.0 arm64), temporary bridge `10.242.0.0/24` gateway `10.242.0.1`, `alpine:3.20` (arm64; the issue's own evidence used the `linux/amd64` sandbox image):
  - `-p 10.242.0.1::9222` exits 0, `Ports={"9222/tcp":[]}`, binding `HostIp=10.242.0.1 HostPort=""`;
  - `-p 10.242.0.1:0:9222` exits 0, `Ports={"9222/tcp":[]}`, binding `HostPort="0"`;
  - `-p 10.242.0.1:39222:9222` exits 125: `ports are not available: exposing port TCP 10.242.0.1:39222 -> 127.0.0.1:0: listen tcp4 10.242.0.1:39222: bind: can't assign requested address`;
  - controls `-p 127.0.0.1::9222` and `-p 0.0.0.0::9222` are assigned (`62490`, `62534`).
    The explicit-port error is consistent with Docker Desktop forwarding published ports onto the macOS host, which does not own the Linux VM's bridge gateway address. That is an explanation, not an established engine root cause; the dynamic case fails silently. A native Linux engine is not available in this round and stays untested.

## What Changes

In `open-computer-use`, the lookup and the routes; no change to publication, launch, membership or isolation.

- **Typed capability fault.** `GatewayPublicationUnassigned(LifecycleError)` (status 503, reason `gateway_publication_unassigned`). `get_container_service_address` raises it when the container is running, its immutable `PortBindings` request the service port, and the engine assigned no host port for it (missing entry, empty `HostPort`, or `HostPort == "0"`). Absent, not running, no binding at all, and Docker errors still return `None`. `_published_address` treats `HostPort == "0"` as unassigned instead of returning `host:0`.
- **Routes surface the fault instead of absence.** `browser_status` and `terminal_status` answer `{"active": false, ..., "reason": "gateway_publication_unassigned", "detail": <message>}`; `browser_cdp_json` and `browser_cdp_json_version` answer 503 through the existing `_lifecycle_http_error` helper (`app.py:1159-1161`), so the body is `{"detail": {"detail": <message>, "reason": "gateway_publication_unassigned"}}`. The WS proxies keep the existing `1011` close for a lookup exception; `test_lookup_exception_closes_1011` gains the typed fault as a parametrized case. The auth guard still runs before every lookup.
- **One existing test changes meaning.** `test_network_membership.py::test_missing_publication_is_unavailable_even_with_container_ip` (`:1208-1225`) seeds a running container through `client.put(..., published={})`, whose default `bindings` request both ports on the gateway (`:324-329`); under the new rule that is the unassigned case and raises. The test passes `bindings={}` so it keeps proving the spec's "Missing publication" scenario (no immutable binding → unavailable), and a sibling case covers the unassigned-with-binding raise.
- **Real-engine qualification test**, opt-in (`OCU_ENGINE_PROBE=1`): creates a temporary bridge and a container named like a chat sandbox that publishes both `SANDBOX_PUBLISHED_PORTS` on the gateway through the `_create_container` `ports=` shape, then calls the real `get_container_service_address` against the real engine (the Docker client is monkeypatched to `docker.from_env()`), asserts the verdict per port matches the engine's own `NetworkSettings.Ports` and that the immutable binding carries the gateway, and writes a JSON record of engine, host, image store, image platform and the observation. It is the AC1 instrument: run here it records the Desktop fault; run on a native Linux engine it records assignment.
- **Operator docs.** `computer-use-server/README.md` gains a short "Sandbox network host support" note after the configuration table: native Linux is the supported profile for gateway publication; on Docker Desktop (observed profile above) sandboxes run for tool calls but browser and terminal report `gateway_publication_unassigned`; no loopback, wildcard, compose-network or container-IP fallback exists.
- **Evidence record** in this repository: `docs/evidence/issue-442/2026-10-20-docker-desktop-gateway-publication.md` with the probe commands and verbatim output, the qualification-test record, and the native Linux row marked untested.

Divergence from the issue text: the issue is `Readiness: needs-triage` and lists "automatically queueing implementation" as out of scope. This slice proceeds on the user's 2026-10-20 decision to run #442 on this machine's Docker Desktop. The Solution-direction alternative (reject the Desktop profile at launch) is not taken: a launch-time guard would roll back every Desktop sandbox, fail the integration suite that passed 14/14 on this engine, and block the remaining local #197 work; AC3 asks for a capability error before the browser route is presented as available, which the status routes are.

AC3 is met at the API and operator layer. The preview SPA (`static/preview.js:2434-2436`) reads only `active`, so a browser user sees "inactive" with the reason visible only in the response body (no log line is added); displaying `reason` in the SPA and WebUI is a follow-up issue filed in task 4.2, not part of this slice.

## Capabilities

### Modified Capabilities

- `ocu-network-isolation`: the "Published service addressing without compose fallback" requirement distinguishes an unassigned requested publication (typed capability fault, surfaced by the status and JSON routes) from a missing one (unavailable).

## Impact

- `computer-use-server/docker_manager.py` (`GatewayPublicationUnassigned`, `_unassigned_publication`, `_published_address`, `get_container_service_address`)
- `computer-use-server/app.py` (four HTTP routes; `_lifecycle_http_error` reused)
- `tests/orchestrator/test_sandbox_addressing.py`, `tests/orchestrator/test_network_membership.py` (one test modified, cases added), `tests/test_auth_guard.py` (route cases), `tests/orchestrator/test_ws_recheck.py` (one parametrized case), `tests/orchestrator/test_engine_gateway_publication.py` (new, opt-in)
- `computer-use-server/README.md`
- This repository: the evidence record and the archive.

Issue #442 stays open after this slice: AC1's native Linux row and AC2 (assigned ports and a real download on a supported profile) need a native Linux engine. #197's acceptance criteria are unchanged and its 14-test, zero-failure production-profile result stays valid evidence (AC5). The slice result is posted on the issue.

## Triage

- Issue type: bugfix (lookup reports a running sandbox as absent) plus host-profile qualification
- Fixture level: expanded. Production lookup used by six call sites, a new typed error, an HTTP contract change, and a real-engine test.
- Upstream suggested level: absent (`needs-triage`, P2, size M)
- Blast radius: browser and terminal status/JSON routes and both WS proxies; launch, publication and membership untouched.
- Selected risk packs:
  - Compatibility: every `get_container_service_address` caller handles the raise; `None` semantics for absent, stopped and unbound containers unchanged; `_published_address` loopback/wildcard narrowing unchanged.
  - Error paths / contract: the typed error's status, reason and message; status payload additive; JSON routes 503 in the `_lifecycle_http_error` shape; WS `1011`.
  - Shared state / ordering: the fake engine's start-time assignment knob leaves the existing membership cases untouched.
  - Documentation / migration notes: README note and the evidence record.
- Not selected:
  - Auth: the guard runs before the lookup on every route (`test_auth_guard.py:97-100` protected list), unchanged.
  - Resource limits, file IO, schema, dependencies, secrets: unchanged. The opt-in engine test uses `alpine:3.20` (configurable) and force-removes its container and network by name.
- Known limit: a sandbox whose network was disconnected by an operator while running loses its port mapping the same way and reports this fault; the message names the requested port and address, which is what the operator needs either way.
- Evidence floor:
  - each new test red against the pre-change source and green after;
  - mutant A: `HostPort == "0"` counted as assigned in both `_published_address` and `_unassigned_publication` (red: the `_published_address` `"0"` case and the lookup `"0"` case in `test_sandbox_addressing.py`); mutant B: the `except GatewayPublicationUnassigned: raise` clause removed (red: the addressing and membership raise cases; the route cases stay green because they monkeypatch the lookup); restore byte-identical;
  - `test_sandbox_addressing.py`, `test_network_membership.py`, `test_auth_guard.py`, `test_ws_recheck.py` green; the CI-form `python -m pytest tests/orchestrator/` green with the opt-in module collected and skipped;
  - the opt-in engine test run on this machine with its JSON record (fault observed for both ports), attached to the evidence file;
  - after review is clean, the two-phase clean-clone evidence; `./tests/test-project-structure.sh` and the commit hooks pass.
