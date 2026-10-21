## Context

`@playwright/cli@0.1.1` resolves its configuration file in this order (package `playwright@1.59.0-alpha-1771104257000`): the `PLAYWRIGHT_MCP_CONFIG` environment variable (`lib/mcp/browser/config.js:237-283`, mapped to `configFile`; daemon `lib/cli/daemon/program.js:78-80` takes `envOverrides.configFile ?? daemonOverrides.configFile`), then `--config`, then `.playwright/cli.config.json` under the process working directory (`lib/cli/client/program.js:241-250`). A file named by the variable must exist: `loadConfig` reads it and throws ENOENT otherwise (`configIni.js:38`). Without `outputDir`, artifacts go to `<workspace root>/.playwright-cli` in skill mode (`config.js:305-310`, created on first output); downloads are saved through the same `outputFile` resolution (`lib/mcp/browser/tab.js:120-131`), so there is no separate downloads location. The built-in default channel is `chrome` (`config.js:61-65`); `browserName: chromium` also turns `chromiumSandbox` off (`config.js:108-110`). `mergeConfig` reads `browserName` and `launchOptions` only under the `browser` key (`config.js:335-344`). The daemon (`run-cli-server`) loads the configuration once per session. The printed artifact links are relative to the calling client's working directory, sent per call as `_meta.cwd` (`lib/mcp/browser/response.js:54-58`, `lib/mcp/browser/browserServerBackend.js:58`).

The image (`open-computer-use` `cd68865`) exports the wrong variable in the `playwright-cli` wrapper (`Dockerfile:261`) and writes the production config at container start (`Dockerfile:309-340`, inside the entrypoint heredoc `:284-581`). `npx @playwright/cli install --skills` at build time (`:248`) writes `/home/assistant/.playwright/cli.config.json` with `browserName: chromium` and the skills directory only (client `program.js:180-186`, `:213-218`); that file is why a launch from `/home/assistant` works today and a launch from any other directory does not. The image pre-creates `/mnt/user-data/files` owned by `assistant` (`:200-208`), so the production `outputDir` is writable in a bare container as well as under the stack's bind mount.

In production the sandbox runs as `assistant` with working directory `/home/assistant` through the entrypoint when the image name contains `computer-use` (`computer-use-server/docker_manager.py:1210-1215`, `:1372-1374`); otherwise `bash` runs without the entrypoint and the config file is never written (`:1217-1221`). The 2026-10-21 run under the name `ocu442-sandbox` ran as `root` in `/root`, which is where the `chrome` fallback surfaced; the production image name avoids that failure but not the output-location defect.

## Decisions

### Variable, not `--config`

The wrapper keeps its single `export` line and switches the name to `PLAYWRIGHT_MCP_CONFIG`, keeping the `${PLAYWRIGHT_MCP_CONFIG:-/home/assistant/playwright-cli.json}` override form. `--config` would have to be threaded through both the `open` and the `goto` call in the wrapper and through every other subcommand the skill docs use; the variable covers all of them and the daemon. The build-time default file stays: the variable wins over it (`program.js:78-80`), and removing it would change the `install --skills` step for no benefit.

The daemon lets the variable win over `--config` as well (`program.js:78-80`: `envOverrides.configFile ?? daemonOverrides.configFile`), so an always-exported default would silently ignore the documented `playwright-cli open --config=<file>`. The wrapper therefore scans its arguments and injects the default only when none is `--config` or `--config=*`; an explicitly exported `PLAYWRIGHT_MCP_CONFIG` still wins over `--config` by CLI semantics (fix pass 1, open-computer-use#160).

### Channel pinned in the production config

Inside the `"browser"` object of the entrypoint-written JSON (`Dockerfile:313-315`): `"browserName": "chromium",` is inserted before `"launchOptions": {`, and `"channel": "chromium",` becomes the first key of `launchOptions`, before `"args"`. Both lines use the heredoc's `\n\` continuation form. The CLI then launches Playwright's chromium from `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH`, `Dockerfile:41`) regardless of the working directory and of the default file; without the pin the built-in `chrome` channel would apply the moment the production file loads. Nothing else in the JSON changes.

### The relay regression follows the variable

`tests/test-docker-image.sh:102` changes to `-e PLAYWRIGHT_MCP_CONFIG=/tmp/relay-playwright.json`. The regression starts its container with `--entrypoint=bash`, so `/home/assistant/playwright-cli.json` is never written there; with the wrapper's new default the daemon would fail on ENOENT. Under the old name the regression's own file (`:116-127`: `outputDir /tmp/relay-output`, `browserName chromium`, `executablePath`, `headless`, `--no-sandbox --disable-dev-shm-usage`) was never loaded either; after the change it is loaded for the first time. `executablePath` takes precedence over any channel (playwright-core `server/browserType.js:175-183`), so the launch shape is the one the file describes. The old wrapper leaves `PLAYWRIGHT_MCP_CONFIG` alone, so the red run with the harness edit applied is the first real execution of that file, on the current image; its result is recorded there, and the green run repeats it on the rebuilt image.

### One output location, documented

Downloads, snapshots, traces and console logs resolve through `outputDir`; the production config has named `/mnt/user-data/files` since the initial release, and the viewer and #197 name the same directory for downloads. The change makes that declaration effective and updates the skill docs. `SKILL.md:192` is an example of CLI output, so it shows the link as the CLI prints it from `/home/assistant` (`../../mnt/user-data/files/page-2026-02-14T19-22-42-679Z.yml`) with one sentence that snapshots are written to `/mnt/user-data/files` and appear in the workspace Files tab; `tracing.md:132` uses the absolute `/mnt/user-data/files/traces`. Consequence to state in the PR: CLI artifacts now appear in the Files tab. A listing filter is a separate decision, not part of this change.

### Harness check proves behaviour, not text

`tests/test-docker-image.sh` gains `run_browser_cli_config_regression` and `test_browser_cli_config`. Shared helpers: `bounded_docker` and the owned-container reaping move out of `run_browser_relay_regression`'s subshell to top level, parameterised by the owner label (`reap_owned_containers <label-key> <owner>`: the label-filtered lookup and the `rm -f` loop), and both regressions use them, so the behaviour has one implementation (OCU `AGENTS.md` canonicality). Per-regression state stays local: reading the cidfile, the `launching` flag, `rm -rf "$work"`, the refuse-to-reuse-label precheck and `exit "$rc"`. The new regression owns a container labelled `ocu.browser-cli-config-test-owner=<owner>` (`--cidfile`, `trap` cleanup on EXIT/INT/TERM), `--platform linux/amd64 --network=none --user=assistant`, started through the real `ENTRYPOINT` (`"$IMAGE" sleep 420`, no `--entrypoint`) because `run_in_container` bypasses the entrypoint that writes the config; the entrypoint ends with `exec "$@"`, so `sleep 420` keeps the container alive. The probe is one `bounded_docker 400 exec -i "$cid" timeout 360s bash -s` heredoc (two iterations of at most 60 + 60 + 30 s each fit inside the bound):

```bash
set -uo pipefail
for i in $(seq 50); do [ -s /home/assistant/playwright-cli.json ] && break; sleep 0.2; done
[ -s /home/assistant/playwright-cli.json ] || { echo "entrypoint did not write /home/assistant/playwright-cli.json" >&2; exit 1; }
rc=0
for dir in /home/assistant /tmp; do
  (
    set -euo pipefail
    trap 'timeout 30s playwright-cli close >/dev/null 2>&1 || echo "close failed from '"$dir"'" >&2' EXIT
    cd "$dir" || exit 1
    rm -f /mnt/user-data/files/page-*.yml
    if out=$(timeout 60s bash -o pipefail -c "playwright-cli open about:blank 2>&1 | head -40"); then status=0; else status=$?; fi
    printf 'open from %s: exit %s\n%s\n' "$dir" "$status" "$out"
    case "$out" in *"Chromium distribution"*) echo "chrome channel fallback from $dir" >&2; exit 1;; esac
    [ "$status" -eq 0 ] && [[ "$out" == *opened* ]] && [[ "$out" == *about:blank* ]] || { echo "open did not report an opened about:blank page from $dir" >&2; exit 1; }
    if snap=$(timeout 60s playwright-cli snapshot 2>&1 | head -20); then :; else echo "snapshot failed from $dir: $snap" >&2; exit 1; fi
    printf 'snapshot from %s:\n%s\n' "$dir" "$snap"
    [[ "$snap" == *"mnt/user-data/files/page-"*".yml)"* ]] || { echo "snapshot link does not point into /mnt/user-data/files from $dir" >&2; exit 1; }
    ls /mnt/user-data/files/page-*.yml >/dev/null 2>&1 || { echo "no snapshot under /mnt/user-data/files from $dir" >&2; ls -la /mnt/user-data/files >&2 2>&1 || true; exit 1; }
    for stray in /home/assistant/.playwright-cli /tmp/.playwright-cli; do
      [ ! -e "$stray" ] || { echo "unexpected $stray from $dir" >&2; ls -la "$stray" >&2 2>&1 || true; exit 1; }
    done
  ); st=$?; [ "$st" -eq 0 ] || { rc=1; echo "FAILED from $dir" >&2; }
done
exit "$rc"
```

Each directory runs in its own subshell with its own `set -e`, closes its session from an EXIT trap (so a failed first directory does not leave Chromium on the fixed CDP port 9223 for the second), and the loop reports both results before the aggregate exit, so red runs and mutants show the `/home/assistant` and the `/tmp` outcome. `page-*.yml` is cleared before each iteration and the printed snapshot link (relative to the calling client's working directory, sent per call as `_meta.cwd`: `lib/cli/client/session.js`, `lib/mcp/browser/browserServerBackend.js:58`, `lib/mcp/browser/response.js:54`) must point into `/mnt/user-data/files`, so each iteration proves its own snapshot location. From `/tmp` the second `open` has its own workspace hash and daemon (client `program.js:124-136`, `registry.js:43-50`); the socat relay is reused through the wrapper's `pgrep`; the CLI's sockets live under `/tmp/playwright-cli/<hash>/`, which the stray checks do not match.

The function is wrapped at the call site as step 14 is (`:727`): `if OUT=$(run_browser_cli_config_regression 2>&1); then pass "…"; else fail "… exited $?"; printf '%s\n' "$OUT"; fi`, so the script's own `set -euo pipefail` reaches `fail`. It is called just before `test_browser_relay` (`:747`) and is not part of `--browser-relay-only` mode (`:255`), which keeps that mode's meaning. Banner style `[browser-cli-config] …`. Entrypoint banners go to the container's stdout and do not affect the probe, which is judged on exit status and the captured strings. `playwright-cli list` is not used: it renders the resolved configuration only for an open session and its text is not a contract; the two-directory probe is the behavioural replacement for the issue's first acceptance criterion.

### Red and green

Red runs the new check against the current amd64 image on the Mac (`ocu442-sandbox:8c23438`; `git diff --stat 8c23438 cd68865` is empty for the Dockerfile, the harness and the skill docs): from `/home/assistant` the build-time default config launches chromium and the snapshot lands under `/home/assistant/.playwright-cli/`; from `/tmp` no file is found and `open` fails with the `chrome` error. The per-directory subshells report both, and the check fails while the rest of the harness is unchanged (the relay regression runs with its own config loaded for the first time). Green needs a rebuild of the image from the changed Dockerfile (layers from `:259` and `:284` onward; GitHub and npm downloads work under the Mac's proxy). Mutants rebuild the same layers: A reverts the variable name (red from `/home/assistant` on the snapshot location, which is the production defect); B removes the channel pin (red on the `chrome` error from either directory, since the production file now loads and carries no channel).

### Full-stack verification

The orchestrator ships the rebuilt image to the native Linux host under a name containing `computer-use` (`ocu582-computer-use:<sha>`), so the sandbox runs as `assistant` in `/home/assistant` through the entrypoint, re-creates the stack used for #442 (same compose, `SANDBOX_IMAGE` updated), and runs the download driver with the production `playwright-cli open <url>` from the default working directory and no config override. Assertions: the file in `/mnt/user-data/files` and in the listing, `/home/assistant/.playwright-cli` absent; then `pkill -f run-cli-server`, `playwright-cli open <url>` again, click again, same assertions. The run is recorded under `docs/evidence/issue-582/` in this repository after merge, and #197's download item is ticked from it.

## Risks

- A `playwright-cli` call in a container that did not run the entrypoint now fails with ENOENT on `/home/assistant/playwright-cli.json` (previously the `chrome` error from `/root`). In the repository the relay regression is the one such caller and is updated; non-`computer-use` image names are outside the production contract.
- The relay regression's own config is executed for the first time in the red run (current image, harness edit applied); `executablePath` plus `--no-sandbox` is the shape Playwright documents, but that run is the first proof.
- Artifacts in the Files tab: users will see `page-*.yml` and `console-*.log` next to their files. Stated in the PR; a filter is out of scope.
- A running sandbox keeps its old daemon configuration until the daemon restarts; fresh containers are unaffected.

## Must preserve

- Relay lifetime and the `open`/`goto` interception window (existing spec scenarios, relay regression with its variable renamed).
- The `${VAR:-default}` operator override.
- `--config=<file>` on `open` loads that file (the wrapper skips its default injection); the harness's third probe covers it.
- `outputDir`, launch args and navigation timeout values.
- Harness: all existing checks, their accounting, and `--browser-relay-only` mode.
