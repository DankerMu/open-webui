## Context

Paths are in the sibling `open-computer-use` checkout at `origin/main` `cec0a91`.

- **Errors:** `docker_manager.py` `LifecycleError(message, status_code, reason)` (`:95-102`); `LaunchFailed` (`:124-126`) and siblings fix their status and reason in `__init__`. `app.py:1159-1161` `_lifecycle_http_error(exc)` maps a `LifecycleError` to `HTTPException(exc.status_code, {"detail": str(exc), "reason": exc.reason})`.
- **Bindings helpers:** `_immutable_bindings(container)` (`:815-818`) returns `HostConfig.PortBindings`; `_binding_entries(bindings, port)` (`:821-827`) normalizes the entry list for `f"{port}/tcp"`.
- **Lookup:** `_published_address(container, container_port)` (`:971-990`): host networking → loopback; otherwise the first `NetworkSettings.Ports[f"{port}/tcp"]` entry with a truthy `HostPort`, wildcard/empty `HostIp` narrowed to loopback. `get_container_service_address(chat_id, container_port)` (`:993-1011`): `containers.get` + `reload`, `None` unless running, else `_published_address`; `except Exception: return None`. Production callers: `app.py:958`, `:985`, `:1004`, `:1028`, `:1078`, `:1303` (`mcp_tools.py:157` imports it only).
- **Publication request:** `_create_container` (`:1219`) `config["ports"] = {f"{port}/tcp": (gateway, None) for port in SANDBOX_PUBLISHED_PORTS}`; `SANDBOX_PUBLISHED_PORTS = (CDP_PORT, TTYD_PORT)` (`:362`).
- **Routes:** `app.py` `browser_status` (`:953-978`), `browser_cdp_json` (`:981-997`), `browser_cdp_json_version` (`:1000-1016`), `browser_ws_proxy` lookup lambda (`:1028`), `terminal_status` (`:1073-1097`, `None` branches at `:1079-1088`), terminal WS lookup lambda (`:1303`). `ws_recheck.py:307-316`: a lookup exception closes `BACKEND_FAIL_CLOSE_CODE` (1011); `None` closes `PREACCEPT_CLOSE_CODE`. `app.py` imports names with `from docker_manager import ...`; there is no `app_module.docker_manager` attribute.
- **Clients:** the preview SPA polls `/browser/{chat}/status` (`static/preview.js:2430`, `:2525`) and reads `active` only (`:2434-2436`); the terminal path at `:2013-2018` falls to the generic failure branch when neither `container_stopped` nor `meta_exists` is present. Out of this slice.
- **Tests:** `tests/orchestrator/test_sandbox_addressing.py` `_container(attrs, status)` (`:31-36`), `PublishedAddressTests` (`:39-93`, `test_returns_none_when_not_published` `:87-90` has no `HostConfig`), `ServiceAddressTests` (`:96-145`, patches `get_docker_client`). `tests/orchestrator/test_network_membership.py` `FakeClient.__init__` (`:139-156`), `make_container` with the `start()` closure calling `_assign_published_ports` (`:232-238`), `put` defaults (`:324-329`: `bindings=None` seeds both ports on the gateway with host ports; `published=None` copies them), `_assign_published_ports` (`:348-362`), the `world` fixture (`:364-411`), `test_unassigned_dynamic_host_port_does_not_block_launch` (`:928-949`), `test_missing_publication_is_unavailable_even_with_container_ip` (`:1208-1225`). `tests/test_auth_guard.py` protected-route list (`:97-100`), `app_module` fixture importing under `isolated_modules` (`:143-150`), `TestWebSockets` monkeypatching `app_module.get_container_service_address` (`:1153-1192`), `client` fixture and `_bearer()`. `tests/orchestrator/test_ws_recheck.py::test_lookup_exception_closes_1011` (`:1748-1761`, raises `RuntimeError` from the lookup). Opt-in gating pattern: `tests/orchestrator/test_cli_adapters_live.py:54-61`. CI runs `python -m pytest tests/orchestrator/` (`.github/workflows/build.yml:251`).
- **Docs:** `computer-use-server/README.md:482-484` (`OCU_SANDBOX_NETWORK`, `SANDBOX_HOST_BIND_IP`, `ENABLE_NETWORK` rows).

## Decisions

- **Fault type.** In `docker_manager.py` next to `LaunchFailed`:

  ```python
  class GatewayPublicationUnassigned(LifecycleError):
      """A running sandbox's requested publication never received a host port."""

      def __init__(self, container_port, host_ip):
          self.container_port = container_port
          self.host_ip = host_ip
          super().__init__(
              f"{container_port}/tcp publication on {host_ip} was accepted by the engine "
              "but never assigned a host port; gateway publication is unsupported on this "
              "engine profile (computer-use-server/README.md, Sandbox network host support)",
              status_code=503,
              reason="gateway_publication_unassigned",
          )
  ```

- **Predicate.** `_unassigned_publication(container, container_port) -> Optional[str]`: `entries = _binding_entries(_immutable_bindings(container), container_port)`; no entries → `None` (nothing requested; "Missing publication" stays unavailable). If any `NetworkSettings.Ports[f"{port}/tcp"]` entry has a `HostPort` not in `("", "0", None)` → `None` (assigned; `_published_address` already resolved it). Otherwise return the first entry's `HostIp`, or `"0.0.0.0"` when it is empty, so the message names what was requested. Pure function of `container.attrs`, no Docker call.
- **`_published_address`** skips entries whose `HostPort` is `"0"` the same way it skips empty ones (one condition change), so a `host:0` address is never returned.
- **`get_container_service_address`:**

  ```python
  try:
      c = client.containers.get(container_name)
      c.reload()
      if c.status != "running":
          return None
      address = _published_address(c, container_port)
      if address is not None:
          return address
      host_ip = _unassigned_publication(c, container_port)
      if host_ip is not None:
          raise GatewayPublicationUnassigned(container_port, host_ip)
      return None
  except GatewayPublicationUnassigned:
      raise
  except Exception:
      return None
  ```

  Host networking still resolves to loopback before the predicate runs. Docstring updated: "A requested publication the engine never assigned raises `GatewayPublicationUnassigned`."

- **Routes.** `app.py` adds `GatewayPublicationUnassigned` to its `from docker_manager import` list.
  - `browser_cdp_json`, `browser_cdp_json_version`: wrap the lookup in `try: ... except GatewayPublicationUnassigned as exc: raise _lifecycle_http_error(exc) from exc`, giving 503 with body `{"detail": {"detail": <message>, "reason": "gateway_publication_unassigned"}}`. No new helper; the 404 for `None` and the 503 `Browser not available` for an upstream failure are unchanged.
  - `browser_status`: `except GatewayPublicationUnassigned as exc: return {"active": False, "pages": [], "reason": exc.reason, "detail": str(exc)}`; `Cache-Control: no-cache, no-store` as today.
  - `terminal_status`: `except GatewayPublicationUnassigned as exc: return {"active": False, "reason": exc.reason, "detail": str(exc)}` before the stopped/meta checks, which keep their shape for `None`.
  - WS lookups unchanged: the fault propagates from `to_thread` and `ws_recheck.py:307-316` closes `1011`. `test_lookup_exception_closes_1011` is parametrized over a string id (`"runtime"`, `"unassigned"`) and builds the exception in the test body: `RuntimeError("docker ping failed")` (existing) or `app_module.GatewayPublicationUnassigned(9222, "172.31.0.1")` (the fixture cannot be referenced from the decorator).
- **Fake engine knob.** `FakeClient.assign_published_ports = True` in `__init__`; `start()` calls `_assign_published_ports` only when it is true. Default behavior and every existing membership case are unchanged.
- **Modified membership test.** `test_missing_publication_is_unavailable_even_with_container_ip` passes `bindings={}` to `client.put` (its `published={}` stays), so it is the no-binding case and still asserts `None` for both ports with `client.ops` unchanged. Its docstring names the spec scenario. The new sibling `test_unassigned_gateway_publication_raises_without_mutation` uses `client.assign_published_ports = False`, creates through `docker_manager._get_or_create_container(CHAT)` (container running, `Ports` empty, bindings on the gateway), then asserts both lookups raise `GatewayPublicationUnassigned` with `status_code == 503`, `reason == "gateway_publication_unassigned"`, `GATEWAY` and `f"{port}/tcp"` in the message, `launch_sandbox(CHAT) == {"state": "running"}`, container still running, `client.ops` unchanged by the lookups.
- **Addressing tests** (`test_sandbox_addressing.py`, importing `GatewayPublicationUnassigned` and `_unassigned_publication` from `docker_manager`): `PublishedAddressTests.test_host_port_zero_is_unassigned` (`Ports` entry `HostPort "0"` → `None`); `ServiceAddressTests.test_unassigned_gateway_binding_raises_capability_fault` (`HostConfig.PortBindings["9222/tcp"] = [{"HostIp": "172.31.0.1", "HostPort": ""}]`, `Ports = {"9222/tcp": []}` → raises; `exc.status_code == 503`, `exc.reason`, `"9222/tcp"` and `"172.31.0.1"` in `str(exc)`, `networks.get` not called); `test_host_port_zero_binding_raises` (same `HostConfig.PortBindings` as the previous case, `Ports` entry `HostPort "0"` → raises); `test_unassigned_binding_on_a_stopped_container_is_unavailable` (same attrs, `status="exited"` → `None`); the existing absent, Docker-error and no-`HostConfig` cases stay `None`.
- **Route tests** in `tests/test_auth_guard.py`, class `TestUnassignedPublication`, using `client`, `app_module`, `_bearer()`; the fault is raised from `app_module.GatewayPublicationUnassigned(9222, "172.31.0.1")` (the class of the fixture's own server generation; a top-level import would be another module instance and the route's `except` would not match) through `monkeypatch.setattr(app_module, "get_container_service_address", boom)`. Cases: `GET /browser/{CHAT}/status` → 200, `active` false, `pages == []`, `reason == "gateway_publication_unassigned"`, `"9222/tcp"` in `detail`, `Cache-Control` contains `no-store`; `GET /terminal/{CHAT}/status` → 200 with `reason`/`detail` and without `container_stopped`/`meta_exists`; `GET /browser/{CHAT}/json` and `/json/version` → 503, `body["detail"]["reason"] == "gateway_publication_unassigned"`, `"9222/tcp"` in `body["detail"]["detail"]`.
- **Opt-in engine qualification test** `tests/orchestrator/test_engine_gateway_publication.py`:
  - gating: module-level `pytestmark = pytest.mark.skipif(os.environ.get("OCU_ENGINE_PROBE", "").strip().lower() not in ("1", "true", "yes"), reason="Engine gateway-publication probe is opt-in; export OCU_ENGINE_PROBE=1 to enable.")`; inside the test, `pytest.skip` when `docker.from_env().ping()` raises;
  - environment: `OCU_ENGINE_PROBE_SUBNET` (default `10.242.0.0/24`; gateway is host `.1`), `OCU_ENGINE_PROBE_IMAGE` (default `alpine:3.20`, pulled through the SDK when absent), `OCU_ENGINE_PROBE_OUT` (default `<tmp_path>/engine-gateway-publication.json`); a network-create failure (for example a subnet overlap) fails the test with the subnet variable named;
  - resources: network `ocu-engine-probe-<pid>` (bridge, IPAM subnet and gateway); container named `owui-chat-engine-probe-<pid>` (so `get_container_service_address("engine-probe-<pid>", port)` finds it), label `managed-by=ocu-engine-probe`, `command=["sleep", "120"]`, `network=<network id>`, `ports={f"{port}/tcp": (gateway, None) for port in SANDBOX_PUBLISHED_PORTS}`, created with `containers.create` then `start()` (not `run(detach=True)`, so a failed start still leaves a handle); wait for `running` up to 15 s; `finally` force-removes the container by name (`containers.get(name).remove(force=True)`, ignoring `NotFound`) and then the network;
  - subject: `monkeypatch.setattr(docker_manager, "get_docker_client", lambda: client)`, then for each port call the real `get_container_service_address`; branch on the engine's own `NetworkSettings.Ports[f"{port}/tcp"]`: an entry with a non-empty, non-`"0"` `HostPort` → the function returns `f"{gateway}:{host_port}"`; otherwise it raises `GatewayPublicationUnassigned` whose message names `f"{port}/tcp"` and the gateway. In both branches assert `HostConfig.PortBindings[f"{port}/tcp"][0]["HostIp"] == gateway` and `HostPort in ("", "0")` (the request shape the engine accepted);
  - record: JSON `{"engine": {"version", "os", "arch", "api_version"} from client.version(), "platform": {"kernel": info["KernelVersion"], "storage_driver": info["Driver"], "driver_status": info["DriverStatus"], "architecture": info["Architecture"], "os_type": info["OSType"], "operating_system": info["OperatingSystem"]}, "host": {"platform": platform.platform(), "machine": platform.machine()}, "image": {"reference", "platform": image.attrs["Os"] + "/" + image.attrs["Architecture"]}, "gateway", "ports": NetworkSettings.Ports, "bindings": HostConfig.PortBindings, "verdict": {"<port>": "assigned <address>" | "unassigned"}}`, written to `OCU_ENGINE_PROBE_OUT` and the path printed;
  - the test passes on both profiles and records which one it saw; the verdict value is the AC1 observation. In the CI-form run it is collected and skipped.
- **README note**, after the configuration table, heading `### Sandbox network host support`: gateway publication needs an engine host that owns the sandbox-bridge gateway address, which a native Linux engine does; Docker Desktop (observed: Engine 29.1.3, linux/arm64, containerd image store, macOS host) accepts the publication but assigns no host port, so sandboxes run for tool calls while `/browser/{chat}/status` and `/terminal/{chat}/status` answer `reason: gateway_publication_unassigned` and the CDP JSON routes answer 503; there is no loopback, wildcard, compose-network or container-IP fallback, and `ENABLE_NETWORK=false` disables publication rather than working around it. Names the opt-in test and its variables as the qualification command.
- **Evidence record** (this repository, archive PR): `docs/evidence/issue-442/2026-10-20-docker-desktop-gateway-publication.md` with a Boundary section (observation vs explanation, native Linux untested, probe image platform vs the issue's `linux/amd64` sandbox), the probe commands, the verbatim probe table, the qualification-test JSON record, the statement that #197's acceptance criteria and its 14/14 production-profile result are unchanged, and the next step (run the test on a native Linux engine, then AC2).

## Red / green plan

Red, against the pre-change source:

- addressing: `test_host_port_zero_is_unassigned` currently returns `"host:0"`; `test_unassigned_gateway_binding_raises_capability_fault` and `test_host_port_zero_binding_raises` currently return `None` / `"172.31.0.1:0"` (no raise); the import of `GatewayPublicationUnassigned` fails before that, so the red run records the ImportError for the module and the three failing assertions once the names exist (the implementer may stage the class first to show assertion-level red);
- membership: `test_unassigned_gateway_publication_raises_without_mutation` fails at the first `pytest.raises` (lookup returns `None`); the modified `test_missing_publication_is_unavailable_even_with_container_ip` stays green before and after;
- routes: the four `TestUnassignedPublication` cases fail; before the change every route lets the fault propagate and `TestClient` (default `raise_server_exceptions=True`) re-raises it into the test;
- WS: the new parametrized case of `test_lookup_exception_closes_1011` is green before and after (any exception already closes `1011`); it is a regression guard, not a red case.

Preserved (must stay green): `test_returns_none_when_not_published` (no `HostConfig`), `test_returns_none_when_the_container_is_not_running`, `test_returns_none_when_the_container_is_absent`, `test_published_port_works_without_any_network`, `test_unassigned_dynamic_host_port_does_not_block_launch` (fake assigns on start by default), `test_address_uses_assigned_gateway_publication_only`, the protected-route list in `test_auth_guard.py`.

Mutants: A, `"0"` counted as assigned in both `_published_address` and `_unassigned_publication` (red: `test_host_port_zero_is_unassigned`, `test_host_port_zero_binding_raises`); B, the `except GatewayPublicationUnassigned: raise` clause removed (red: the addressing raise cases and the membership raise case; route cases stay green by construction). Restore byte-identical (`cmp`).

## Non-goals

- No launch-time rejection of the Desktop profile (see proposal); no loopback, wildcard, compose-network or container-IP fallback; no change to `_bindings_match_gateway`, membership repair or DNS checks.
- No SPA or WebUI client change to display `reason`; follow-up issue filed in task 4.2.
- No native Linux qualification in this round; AC1's Linux row and AC2 stay open on the issue.
