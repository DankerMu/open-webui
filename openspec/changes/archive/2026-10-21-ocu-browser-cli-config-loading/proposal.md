## Why

#582: the sandbox image's production Playwright CLI configuration is never loaded. The `playwright-cli` wrapper exports `PLAYWRIGHT_CLI_CONFIG` (`Dockerfile:261`), but `@playwright/cli@0.1.1` reads its config file from `PLAYWRIGHT_MCP_CONFIG` (package `lib/mcp/browser/config.js:237-283`, `configFromEnv` → `configFromCLIOptions` → `configFile`; daemon `lib/cli/daemon/program.js:78-80`), from `--config`, or from `.playwright/cli.config.json` under the process working directory (`lib/cli/client/program.js:241-250`). The entrypoint-written `/home/assistant/playwright-cli.json` (`Dockerfile:309-340`: `outputDir: /mnt/user-data/files`, launch args, navigation timeout) is dead configuration. Every browser session runs on the build-time default that `npx @playwright/cli install --skills` wrote to `/home/assistant/.playwright/cli.config.json` (`browserName: chromium`, no `outputDir`), so downloads, snapshots and console logs go to `<workspace>/.playwright-cli/` (`config.js:305-310`; downloads are saved through the same `outputFile` resolution, `tab.js:120-131`), which under the production working directory is the private home volume that the workspace never lists (#197, `test_private_home_file_is_neither_listed_nor_served`). Observed on 2026-10-21 (`docs/evidence/issue-442/2026-10-21-native-linux-gateway-publication.md`): a BrowserViewer download landed in `/home/assistant/.playwright-cli/ocu442-payload.bin`; after copying the production config plus the chromium channel to the path the CLI reads and restarting the daemon, the same click landed in `/mnt/user-data/files` and in the listing. From a working directory without the default file the CLI's built-in default channel `chrome` applies (`config.js:61-65`) and `open` fails with `Chromium distribution 'chrome' is not found`, because nothing pins the chromium channel.

Paths are in the sibling `open-computer-use` checkout at `origin/main` `cd68865`.

- `Dockerfile:255-262`: the wrapper (`printf` into the `playwright-cli` path): exports the config variable with a `${VAR:-default}` form, starts the socat relay, splits `open <url>` into `open` + `goto`.
- `Dockerfile:284-583`: the entrypoint heredoc (`RUN printf` at `:284`, script body ends at `:581`); `:309-340` writes `/home/assistant/playwright-cli.json`, with `"browser": { "launchOptions": { "args": [...] }, "contextOptions": {...} }` at `:313-336`. The image pre-creates `/mnt/user-data/files` owned by `assistant` (`:200-208`), so the directory exists in a bare container too.
- `tests/test-docker-image.sh`: `run_in_container` (`:28-36`) bypasses the entrypoint; step 14 (`:721-745`) runs the real `ENTRYPOINT` as `assistant`; `run_browser_relay_regression` (`:52-241`) starts its container with `--entrypoint=bash` and `-e PLAYWRIGHT_CLI_CONFIG=/tmp/relay-playwright.json` (`:99-103`), writes that file inside the container (`:116-127`: `outputDir /tmp/relay-output`, `browserName chromium`, `executablePath`, `--no-sandbox`), then opens `about:blank` twice; `test_browser_relay` (`:243-253`) is called at `:747`; `--browser-relay-only` mode (`:255`) runs only the relay regression.
- `skills/public/playwright-cli/SKILL.md:192` shows the CLI's printed snapshot link (relative to the calling client's working directory, sent per call as `_meta.cwd`: `lib/mcp/browser/response.js:54-58`, `lib/mcp/browser/browserServerBackend.js:58`); `references/tracing.md:132` names `.playwright-cli/traces`.
- The CLI daemon (`run-cli-server`) keeps its configuration for the life of the session; a config change takes effect only for a fresh daemon. `mergeConfig` reads `browser.browserName` and `browser.launchOptions` only under the `browser` key (`config.js:335-344`); `browserName: chromium` also sets `chromiumSandbox` false (`config.js:108-110`).
- Spec: `openspec/specs/ocu-browser-cli/spec.md` (relay lifetime; its two scenarios stay as they are).

## What Changes

In `open-computer-use` only: `Dockerfile` (wrapper line and entrypoint config), `tests/test-docker-image.sh` (relay regression's variable, one new check), the two skill docs.

- **Config variable.** The wrapper exports `PLAYWRIGHT_MCP_CONFIG="${PLAYWRIGHT_MCP_CONFIG:-/home/assistant/playwright-cli.json}"` instead of `PLAYWRIGHT_CLI_CONFIG`, and only when no argument is `--config` or `--config=*` (the daemon lets the variable win over `--config`; fix pass 1). Nothing else in the wrapper changes (relay start, `open`/`goto` split, argument forwarding).
- **Channel pin.** Inside the entrypoint-written JSON, under the existing `"browser"` object: `"browserName": "chromium"` before `"launchOptions"`, and `"channel": "chromium"` as the first key of `"launchOptions"` before `"args"`. The CLI's built-in default channel is `chrome`, so the pin is needed even with the variable fixed. `outputDir`, args and `navigationTimeout` stay as they are. The build-time default file is left in place; the environment variable takes precedence over it (`program.js:78-80`).
- **Relay regression follows the variable.** `tests/test-docker-image.sh:102` passes `-e PLAYWRIGHT_MCP_CONFIG=/tmp/relay-playwright.json`. Under the old name the regression's own config was never loaded either; with the harness edit it takes effect for the first time, already on the current image in the red run (`executablePath` overrides the channel, `--no-sandbox`, `outputDir /tmp/relay-output`). Without this edit the wrapper default would point at `/home/assistant/playwright-cli.json`, which the entrypoint-less relay container never writes, and the daemon would fail on ENOENT.
- **Image check.** `tests/test-docker-image.sh` gains `test_browser_cli_config` (shared `bounded_docker` and owned-container cleanup hoisted to top level and reused by the relay regression): an owned container run through the real `ENTRYPOINT` as `assistant`, waiting for the entrypoint to write the config, probing from `/home/assistant` and from `/tmp` in separate subshells that each clear `page-*.yml`, close their session on exit and report their own result: `playwright-cli open about:blank` (captured output must report an opened `about:blank` page and must not contain `Chromium distribution`), `playwright-cli snapshot` (its printed link must point into `/mnt/user-data/files`), then assertions that a `page-*.yml` exists under `/mnt/user-data/files/` and that `/home/assistant/.playwright-cli` and `/tmp/.playwright-cli` do not exist. This is the behavioural replacement for the issue's `playwright-cli list` criterion. It is red on the current image (from `/home/assistant` the snapshot lands in `/home/assistant/.playwright-cli/`; from `/tmp` the `chrome` error) and green on the rebuilt one.
- **Output location decision.** Downloads, snapshots, traces and console logs all resolve through the one `outputDir` (no separate downloads option), so they land in `/mnt/user-data/files` and appear in the workspace listing; this is what the production config has declared since the initial release. The skill docs are updated: `SKILL.md:192` shows the link as the CLI prints it from `/home/assistant`, `[Snapshot](../../mnt/user-data/files/page-2026-02-14T19-22-42-679Z.yml)`, with a sentence that snapshots are written to `/mnt/user-data/files` and appear in the workspace Files tab; `tracing.md:132` uses `/mnt/user-data/files/traces`. A listing filter for CLI artifacts is out of scope and would be its own issue.

## Capabilities

### Modified Capabilities

- `ocu-browser-cli`: new requirement "Production browser CLI configuration".

## Impact

- `Dockerfile` (wrapper `:261`, entrypoint config `:313-315`)
- `tests/test-docker-image.sh` (`:102`, one new check wired before `test_browser_relay` at `:747`)
- `skills/public/playwright-cli/SKILL.md`, `skills/public/playwright-cli/references/tracing.md`
- This repository: the archive only.

User-visible consequence: snapshots (`page-*.yml`), console logs (`console-*.log`) and traces written by the browser CLI now appear in the Files tab next to downloads. No server, viewer, proxy or WebUI change. A `playwright-cli` call in a container that did not run the entrypoint (no `/home/assistant/playwright-cli.json`) now fails with ENOENT instead of the `chrome` error; the relay regression is the one such caller in the repository and is updated.

## Triage

- Issue type: bug (silent loss of workspace-browser downloads to a private volume), follow-up of #197/#442
- Fixture level: standard. Two Dockerfile edits, one harness variable, one harness check, two doc lines; an image rebuild and a real-stack download run are the evidence.
- Upstream suggested level: absent (P2, size S, implementation-ready)
- Blast radius: every sandbox browser session (output location, launch args, navigation timeout now take effect); the relay and the `open`/`goto` split are unchanged.
- Selected risk packs:
  - Compatibility: the relay regression (with its variable renamed) and the two existing spec scenarios are the control; the wrapper keeps its override form; the build-time default file remains.
  - Image contract: the resolved configuration is proven behaviorally in a bare container (through the real entrypoint, from `/home/assistant` and `/tmp`) and in the full stack (real download through the BrowserViewer, nothing under `/home/assistant/.playwright-cli`, same after a daemon restart).
  - Documentation: skill docs match what the CLI prints and where files land.
- Not selected:
  - Server, auth, lookup contract, viewer, schema, dependencies, secrets: unchanged.
  - CLI version: stays at `0.1.1`.
- Evidence floor:
  - red: the new check against the current image (`ocu442-sandbox:8c23438`, amd64, source-identical to `cd68865` for the Dockerfile, harness and skill docs) fails: from `/home/assistant` on the snapshot location, from `/tmp` on the `chrome` error; the rest of the harness unchanged;
  - green: the full harness on the rebuilt image (new check from both directories, relay regression with its own config loaded, step 14);
  - mutants A (variable reverted; red from `/home/assistant` on the snapshot location) and B (channel pin removed; red on the `chrome` error from either directory), each rebuilt and restored byte-identical;
  - full-stack run on the native Linux engine with the rebuilt image under a name containing `computer-use`: the BrowserViewer click lands the download in `/mnt/user-data/files` and the listing with no manual config step, `/home/assistant/.playwright-cli` absent; the same after killing `run-cli-server` and opening again;
  - `./tests/test-project-structure.sh`, the commit hooks; the Python suites are unaffected (no server change) and run only in the clean-clone evidence after review.
