# Sandbox browser CLI configuration loading — native Linux record

## Boundary

This record closes [#582](https://github.com/DankerMu/open-webui/issues/582): the sandbox image's production Playwright CLI configuration was never loaded, so workspace-browser downloads, snapshots and console logs landed in the private home volume instead of `/mnt/user-data/files`. The fix is [open-computer-use#160](https://github.com/DankerMu/open-computer-use/pull/160) (merged as `34dc83c`, reviewed head `0fd79e2`). The runs below use the same user-owned Ubuntu VPS, native Docker engine and full stack as the [#442 native Linux record](../issue-442/2026-10-21-native-linux-gateway-publication.md); only the sandbox image changes. No model provider is involved; the browser is opened through the MCP bash tool exactly as a model would, with the production `playwright-cli open <url>` and no configuration step.

## What changed in the image (open-computer-use `0fd79e2`)

- The `playwright-cli` wrapper exports `PLAYWRIGHT_MCP_CONFIG` (the variable `@playwright/cli@0.1.1` reads) with the default `/home/assistant/playwright-cli.json`, keeping the operator override form, and only when no `--config` argument is present (the daemon lets the variable win over `--config`).
- The entrypoint-written production configuration pins `browserName: chromium` and `launchOptions.channel: chromium`; the CLI's built-in default channel is `chrome`, which the image does not ship.
- `tests/test-docker-image.sh` gains a `[browser-cli-config]` regression: a container through the real entrypoint as `assistant`, probes from `/home/assistant` and `/tmp` (snapshot must land in `/mnt/user-data/files`, no `.playwright-cli` directory) and a third probe with `--config` (snapshot must land in that file's `outputDir`). The relay regression's own configuration is now passed through the same variable.
- Skill docs: snapshot link example as the CLI prints it from `/home/assistant`, a sentence on where snapshots land, a sentence on what a `--config` file replaces, `traces` path.

## Image check (Docker Desktop, `linux/amd64`)

| Run | Image | Result | Raw |
| --- | --- | --- | --- |
| red, new check on the unchanged image | `ocu442-sandbox:8c23438` | 73 passed / 1 failed: from `/home/assistant` the snapshot went to `.playwright-cli/`; from `/tmp` `Chromium distribution 'chrome' is not found` | [log](2026-10-21-image-check-red-8c23438.txt) |
| green | `ocu582-computer-use:7585eb3` | 74 passed / 0 failed; both directories link into `/mnt/user-data/files` | [log](2026-10-21-image-check-green-7585eb3.txt) |
| red, `--config` probe on the first fix | `ocu582-computer-use:7585eb3` | 73 / 1: with `--config` the snapshot still went to `/mnt/user-data/files` (the exported variable won) | [log](2026-10-21-image-check-red-config-flag-7585eb3.txt) |
| green, final wrapper | `ocu582-computer-use:95ed972` | 74 / 0; `--config` probe links `(own-output/page-…yml)` | [log](2026-10-21-image-check-green-95ed972.txt) |

Mutants A (variable reverted), B (channel pin removed) and C (unconditional export) each failed only the new check; their logs are in the PR body of open-computer-use#160.

## Full-stack download on the native Linux engine

Stack as in the #442 record (`postgres:17-alpine`, WebUI `9ad786a`, OCU server and proxy `8c23438`, control network `172.29.144.0/24`, sandbox network `172.29.145.0/24` with gateway `172.29.145.1`), sandbox image `ocu582-computer-use:7585eb3` for the first run and `ocu582-computer-use:95ed972` for the second. Image identity was reconciled by the RootFS layer list (identical on the build host and the VPS; `docker save`/`load` changes the index id). The download target is a 1 MiB file with sha256 `77beec14788332573786febcb72fae0023e0f7b79a04b1416750756078755485`, served from the gateway address on port `18999` to the sandbox.

Driver (same as #442): real WebUI sign-in, a new chat, the sandbox spawned by the server through the first MCP bash call (image name contains `computer-use`, so the entrypoint runs and the tool executes as `assistant` in `/home/assistant`), then `playwright-cli open http://172.29.145.1:18999/` through the bash tool with no override and no `cd`, a click on the full-viewport download link in the BrowserViewer of the standalone preview shell, and after the checks a second cycle after `pkill -f run-cli-server` plus a browser kill and a new `open`.

Observed in both runs ([run on `7585eb3`](2026-10-21-linux-download-run-7585eb3.jsonl), [run on `95ed972`](2026-10-21-linux-download-run-95ed972.jsonl)):

- The bash tool environment carries no `PLAYWRIGHT_MCP_CONFIG`; the entrypoint wrote `/home/assistant/playwright-cli.json`.
- `open` prints `browser-type: chromium` and snapshot links `../../mnt/user-data/files/page-…yml`.
- After the click: `/mnt/user-data/files/ocu442-payload.bin` (1048576 bytes, sha256 `77beec14…`), the same file in the host `outputs/` directory, `GET /ocu/api/outputs/{chat}` lists it, the Files tab shows it ([screenshot](2026-10-21-linux-files-after-download.png), [viewer after the click](2026-10-21-linux-viewer-after-click.png)); `/home/assistant/.playwright-cli` and `/tmp/.playwright-cli` do not exist; zero console errors in the preview shell.
- Second cycle: the daemon was gone (`daemons=0`), the new `open` succeeded, the click wrote the download again (the CLI's `saveAs` overwrote the file in place, same hash) ([Files tab](2026-10-21-linux-files-after-daemon-restart.png)). The `page-*.yml` snapshots and `console-*.log` written by the CLI appear in the listing next to the download, as the fixture accepted.
- From an unrelated directory, `cd /tmp && playwright-cli open http://172.29.145.1:18999/` succeeded with links `../mnt/user-data/files/page-…yml`.
- `--config` on the real stack ([raw](2026-10-21-linux-config-probe.txt)): `cd /tmp && playwright-cli open about:blank --config=/tmp/own.json` with a copy of the production file whose `outputDir` is `/tmp/own-output` printed `[Snapshot](own-output/page-…yml)` and wrote the file there.

A first driver attempt on `7585eb3` completed cycle 1 and did not run cycle 2 because the driver's own `pkill` pattern matched its shell; the pattern was corrected and the whole driver rerun on a fresh chat. Nothing in the stack was changed between attempts.

## Residual resources

Stack down, the three chat sandboxes and their workspace volumes, the sandbox network, the stack and sandbox images removed; [inventory](2026-10-21-linux-teardown-inventory.txt): 0 containers, 0 custom networks, 0 volumes, 3 base images (`ubuntu:24.04`, `postgres:17-alpine`, `python:3.12-alpine`). The old user-test directory noted in the #442 record was left as before.

## What this does and does not establish

- Establishes: with the merged image the production browser session loads the production configuration from the default working directory and from an unrelated one, a user click in the BrowserViewer lands the download in `/mnt/user-data/files` and in the workspace listing with no manual step, the same holds after a daemon restart, a caller's `--config` file replaces the production one, and the relay, `open`/`goto` split and existing image checks are unchanged (74/0). AC1–AC6 of #582 are covered; the last #197 evidence item is ticked on this basis.
- Does not establish: LAN deployment, model-driven sessions, or the behaviour of sandboxes started before the image change (a running daemon keeps its configuration until it restarts). A listing filter for CLI artifacts (`page-*.yml`, `console-*.log`, `traces/`) is not part of this change.
