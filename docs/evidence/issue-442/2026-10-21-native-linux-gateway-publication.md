# Gateway-IP publication on a native Linux engine — qualification and download record

## Boundary

This record completes the native Linux row of [#442](https://github.com/DankerMu/open-webui/issues/442) and its AC2 (assigned host ports for both sandbox service ports on the configured gateway, and a real BrowserViewer download) on one host: a user-owned Ubuntu VPS with a native Docker engine. It also records the "in-sandbox browser download lands in `/mnt/user-data/files`" item of [#197](https://github.com/DankerMu/open-webui/issues/197) on that host. The Docker Desktop observations stay in [the Desktop record](2026-10-20-docker-desktop-gateway-publication.md).

The run used a full stack (reverse proxy, WebUI, OCU server, PostgreSQL) built from the two repositories' `main` heads, because the viewer's WebSocket relay admits only a cookie-authenticated session with a configured WebUI auth URL; the bare integration compose cannot exercise it. No model provider was configured: the sandbox was spawned and driven through the OCU MCP endpoint with the production `bash_tool`, and the viewer was driven by Playwright on the operator's machine through an ssh tunnel to the proxy port. The browser launch inside the sandbox needed two deviations, listed below; they are the subject of the follow-up issue named at the end.

## Engine profile

| Field          | Value                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| Engine         | Docker Engine `29.1.3`, API `1.52`, native (no Desktop)                      |
| Engine OS/arch | `linux/amd64` (`x86_64`), kernel `6.8.0-117-generic`, Ubuntu 24.04.4 LTS     |
| Storage        | `overlayfs`, `driver-type=io.containerd.snapshotter.v1` (same as Desktop)    |
| Host           | Ubuntu VPS, 4 vCPU, 7.4 GiB RAM, iptables `1.8.10 (nf_tables)`, ip_forward 1 |
| Probe network  | user bridge `10.242.0.0/24`, gateway `10.242.0.1`                            |
| Stack network  | sandbox bridge `172.29.145.0/24`, gateway `172.29.145.1`                     |
| Probe image    | `alpine:3.20` (`linux/amd64`)                                                |

## Probe commands and observations (verbatim)

The same five publication specs as the Desktop record, run on 2026-10-21 ([raw output](2026-10-21-linux-probe.txt)):

```
engine: 29.1.3 linux/amd64 api=1.52
platform: Ubuntu 24.04.4 LTS | linux/x86_64 | kernel 6.8.0-117-generic | driver overlayfs | driver-type=io.containerd.snapshotter.v1
host: Linux 6.8.0-117-generic x86_64 Ubuntu 24.04.4 LTS
spec=10.242.0.1::9222 exit=0 ports={"9222/tcp":[{"HostIp":"10.242.0.1","HostPort":"32770"}]} bindings={"9222/tcp":[{"HostIp":"10.242.0.1","HostPort":""}]}
spec=10.242.0.1:0:9222 exit=0 ports={"9222/tcp":[{"HostIp":"10.242.0.1","HostPort":"32771"}]} bindings={"9222/tcp":[{"HostIp":"10.242.0.1","HostPort":"0"}]}
spec=10.242.0.1:39222:9222 exit=0 ports={"9222/tcp":[{"HostIp":"10.242.0.1","HostPort":"39222"}]} bindings={"9222/tcp":[{"HostIp":"10.242.0.1","HostPort":"39222"}]}
spec=127.0.0.1::9222 exit=0 ports={"9222/tcp":[{"HostIp":"127.0.0.1","HostPort":"34969"}]} bindings={"9222/tcp":[{"HostIp":"127.0.0.1","HostPort":""}]}
spec=0.0.0.0::9222 exit=0 ports={"9222/tcp":[{"HostIp":"0.0.0.0","HostPort":"32768"}]} bindings={"9222/tcp":[{"HostIp":"0.0.0.0","HostPort":""}]}
```

| Publication spec       | Accepted | Assigned host port | Immutable binding                     |
| ---------------------- | -------- | ------------------ | ------------------------------------- |
| gateway, dynamic port  | yes      | `32770`            | `HostIp=10.242.0.1`, `HostPort=""`    |
| gateway, port `0`      | yes      | `32771`            | `HostIp=10.242.0.1`, `HostPort="0"`   |
| gateway, explicit port | yes      | `39222`            | `HostIp=10.242.0.1`, `HostPort=39222` |
| loopback, dynamic port | yes      | `34969`            | `HostIp=127.0.0.1`                    |
| wildcard, dynamic port | yes      | `32768`            | `HostIp=0.0.0.0`                      |

Every spec that Desktop left unassigned or rejected is assigned here. Both hosts run the containerd image store, so the store is not the discriminator; the difference is the engine host owning the bridge gateway address.

## Qualification test record

`OCU_ENGINE_PROBE=1 python -m pytest tests/orchestrator/test_engine_gateway_publication.py --import-mode=importlib -p no:warnings -v -s` on `open-computer-use` `8c23438`: 1 passed in 0.81 s. Verdict: `7681: assigned 10.242.0.1:32772`, `9222: assigned 10.242.0.1:32773`. Afterwards no `owui-chat-engine-probe-*` container and no probe network remained. Full record: [2026-10-21-linux-engine-gateway-publication.json](2026-10-21-linux-engine-gateway-publication.json).

## Stack and image identity

| Image                    | Source                                     | Built on                            | Engine image ID                                                           |
| ------------------------ | ------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------- |
| `ocu442-sandbox:8c23438` | OCU `8c23438`, root `Dockerfile`           | macOS Docker Desktop, `linux/amd64` | `sha256:1a3d6cebdcf9c5ad2c56c020fada15279b9f9e0a567b6c1bd40894cd9451fb0e` |
| `ocu442-server:8c23438`  | OCU `8c23438`, `git archive` of the server | macOS Docker Desktop, `linux/amd64` | `sha256:c7dc868dd3ad42d3df66beb03f8be047ea256e3a87c41cc5e88a0e620b7e7065` |
| `ocu442-proxy:8c23438`   | OCU `8c23438`, `deploy/proxy`              | the VPS                             | `sha256:8751edc2937a7801246370417f88a6194931b7eb21bcbc2d732e3c5d02527f08` |
| `ocu442-webui:9ad786a`   | WebUI `9ad786a`, root `Dockerfile`         | macOS Docker Desktop, `linux/amd64` | `sha256:f056a3552d5e8a033157921c83a17ee0dec37ad2a68377bc66b3b32d4f3b312f` |

The sandbox Dockerfile copies only tracked paths, so the working-tree build equals the tracked tree at `8c23438`; the server image was rebuilt from a `git archive` export because the working tree carried an ignored, locally prepared `static/drawio/` that made `prepare_drawio.py` fail on a cross-layer rename. Images were built on the Mac and transferred with `docker save --platform linux/amd64 | docker load` because the VPS could not reach Docker Hub for base images or the BuildKit frontend. The sandbox network was provisioned with `deploy/provision-networks.sh`; the compose file mirrored the production shape (`OCU_WEBUI_AUTH_URL`, `OCU_PUBLIC_PREFIX=/ocu`, `SANDBOX_HOST_BIND_IP=172.29.145.1`, `ENABLE_NETWORK=true`, no model provider).

## AC2 run (2026-10-21)

Sequence, from [the driver log](2026-10-21-linux-download-run.jsonl) (JSON lines; the run reused the chat created by the first attempt):

1. WebUI sign-in as the stack admin; chat `1d3af204-2e94-492f-9d01-33d77bc082c9` created through `POST /api/v1/chats/new`.
2. Sandbox spawned by `tools/call bash_tool` with `X-Chat-Id` on the OCU MCP endpoint. Container `owui-chat-1d3af204-…`, labels `managed-by=mcp-computer-use-orchestrator`, `chat-id`, `tool=computer-use-mcp`, image ID as above, sandbox address `172.29.145.3`:

   ```
   ports={"7681/tcp":[{"HostIp":"172.29.145.1","HostPort":"32770"}],"9222/tcp":[{"HostIp":"172.29.145.1","HostPort":"32771"}]}
   bindings={"7681/tcp":[{"HostIp":"172.29.145.1","HostPort":""}],"9222/tcp":[{"HostIp":"172.29.145.1","HostPort":""}]}
   ```

3. A download target served from the host on the sandbox gateway (`python3 -m http.server 18999 --bind 172.29.145.1`): one full-viewport `<a download>` link to a 1 MiB random `payload.bin`, SHA-256 `77beec14788332573786febcb72fae0023e0f7b79a04b1416750756078755485`. Opened inside the sandbox with `playwright-cli open http://172.29.145.1:18999/` (deviations below).
4. `/ocu/browser/<chat>/status` through the proxy: `{"active": true, "pages": [{"title": "ocu442 download target", …}]}`.
5. Playwright (1.63.0, Chromium) on the operator's machine, tunnelled to the proxy: signed-in page `/ocu/preview/<chat>`, Browser tab, screencast canvas 1262×713 ([before](2026-10-21-linux-viewer-before-click.png)); mouse move, press, 150 ms, release at the canvas centre. The server log shows the relay WebSocket `/browser/<chat>/devtools/page/<id>` accepted; the target page's beacons recorded `mousedown`, `click`, `mouseup` at (631, 356) and the server logged `GET /payload.bin 200`.
6. Within six seconds: `/mnt/user-data/files/ocu442-payload.bin` in the sandbox (1048576 bytes, SHA-256 `77beec14…5485`), the same file in the host's `chat/<chat>/outputs/`, `GET /ocu/api/outputs/<chat>` listing it at revision 5, and the Files tab showing it ([screenshot](2026-10-21-linux-files-after-download.png)). Zero page console errors or page errors on the viewer page.

A zero-gap synthetic `page.mouse.click` on the canvas (first attempt) produced no page event: the viewer forwards the press on a `setTimeout(0)` after the hover move, so the release arrived first. A human-paced press and release is the recorded input.

## Deviations (the follow-up issue)

- The stack's sandbox image was tagged `ocu442-sandbox:8c23438`. The server selects the sandbox user and working directory by the image name containing `computer-use` (`docker_manager.py:1210-1215`, `:1372-1374`); without it, `bash_tool` ran as `root` in `/root` instead of `assistant` in `/home/assistant`. From `/root` the CLI finds no `.playwright/cli.config.json`, defaults to the `chrome` channel, and `playwright-cli open` fails with "Chromium distribution 'chrome' is not found" (the image ships Playwright's chromium only). From `/home/assistant`, where the CLI install wrote a chromium default config, the launch succeeds; a production image name avoids this failure.
- `@playwright/cli@0.1.1` does not read `PLAYWRIGHT_CLI_CONFIG`, the variable the image's wrapper exports; it takes `PLAYWRIGHT_MCP_CONFIG`, `--config`, or `.playwright/cli.config.json` under the working directory. The production config written to `/home/assistant/playwright-cli.json` (`outputDir: /mnt/user-data/files`, launch args) is therefore never loaded, whichever user runs the CLI.
- With the CLI's own default config (chromium, no `outputDir`) the download landed in `/home/assistant/.playwright-cli/ocu442-payload.bin`, inside the private home volume that the workspace listing never shows, not in `/mnt/user-data/files`; the viewer's `Browser.setDownloadBehavior` does not govern a Playwright-created context. This is independent of the user and working directory, so it applies to production. The CLI daemon (`run-cli-server`) keeps its config across invocations, so a config change needs a daemon restart.
- The recorded run copied the production config, plus `browserName: chromium` and `launchOptions.channel: chromium`, to `/home/assistant/.playwright/cli.config.json`, restarted the daemon and browser, and ran `playwright-cli open` from `/home/assistant`. Nothing else in the sandbox, server, proxy, viewer or WebUI was changed; the gateway binding, the relay admission and the download path through the viewer are the production ones.

Follow-up: [#582](https://github.com/DankerMu/open-webui/issues/582).

## Residual resources

After the run the stack was taken down (`docker compose down -v`), the chat and probe sandboxes, their workspace volumes, the sandbox network, the four stack images, the shipped base images and the build cache were removed; see the inventory at the end of this record's commit message and the #197 cleanup comment. The old user-test directory `/home/ubuntu/ocu-user-test-20261002` (288 KiB, holds runtime secrets) was left for the owner.

## What this does and does not establish

- Establishes: on a native Linux engine the production publication shape yields assigned gateway ports for both sandbox services, the viewer relay connects through the cookie-authenticated proxy path, and a user click in the BrowserViewer completes a download into the workspace. AC1 (both profiles recorded), AC2, AC3 (Desktop fault path, PR 157), AC4 (no fallback binding used anywhere in this run) and AC5 (#197 criteria unchanged) of #442 are covered.
- Does not establish: where a download lands in a production session without the config deviation (the evidence above says the private home volume, which the Files tab never lists), or the behaviour of the recommended fix in #582. Those are the follow-up issue's scope. The `chrome` launch failure is attributable to this run's image name, not to the production image.
