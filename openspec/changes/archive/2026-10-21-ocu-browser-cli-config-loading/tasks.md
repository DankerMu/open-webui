## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Harness: hoist `bounded_docker` and the owned-container cleanup (parameterised by owner label) to top level and use them from `run_browser_relay_regression`; change `tests/test-docker-image.sh:102` to `-e PLAYWRIGHT_MCP_CONFIG=/tmp/relay-playwright.json`; add `run_browser_cli_config_regression` + `test_browser_cli_config` per design.md (owned container through the real `ENTRYPOINT` as `assistant`, bounded wait for the config file, per-directory subshells for `/home/assistant` and `/tmp` with close-on-exit, `page-*.yml` cleared per iteration, `opened`/`about:blank` output checks, no `Chromium distribution`, snapshot link into `/mnt/user-data/files` and the file present, both `.playwright-cli` directories absent, diagnostics on failure, aggregate exit, `if OUT=$(…)` pass/fail accounting), called just before `test_browser_relay` at `:747`; excluded from `--browser-relay-only` mode. Red: `./tests/test-docker-image.sh ocu442-sandbox:8c23438` on the current image; record the new check failing from both directories (`/home/assistant`: snapshot under `/home/assistant/.playwright-cli/`; `/tmp`: the `chrome` distribution error), the relay regression's result with its own config loaded for the first time, and every other check unchanged.
- [x] 2.2 `Dockerfile`: wrapper (`:261`) exports `PLAYWRIGHT_MCP_CONFIG="${PLAYWRIGHT_MCP_CONFIG:-/home/assistant/playwright-cli.json}"`; entrypoint config (`:313-315`) gains `"browserName": "chromium",` before `"launchOptions"` and `"channel": "chromium",` as the first key of `"launchOptions"` before `"args"`, inside the `\n\` continuation lines; nothing else in the wrapper or config changes.
- [x] 2.3 Skill docs: `skills/public/playwright-cli/SKILL.md:192` becomes `[Snapshot](../../mnt/user-data/files/page-2026-02-14T19-22-42-679Z.yml)` plus one sentence that snapshots are written to `/mnt/user-data/files` and appear in the workspace Files tab; `references/tracing.md:132` uses `/mnt/user-data/files/traces`.
- [x] 2.4 Rebuild for `linux/amd64` (`docker build --platform linux/amd64 -t ocu582-computer-use:<sha> .` from the repository root); green: `./tests/test-docker-image.sh ocu582-computer-use:<sha>` passes in full (new check from both directories, relay regression with its config loaded, step 14); record the image ID and the harness output.
- [x] 2.5 Mutants, each rebuilt (layers from `:259` or `:284` onward) and restored byte-identical (`cmp`): A, wrapper exports `PLAYWRIGHT_CLI_CONFIG` again (pin kept) → the new check fails from `/home/assistant` on the snapshot location (`/home/assistant/.playwright-cli/` exists) and from `/tmp` on the `chrome` error; B, channel pin removed (variable kept) → `open` reports the `Chromium distribution` error from both directories.

## 3. Verify

- [x] 3.1 Orchestrator, native Linux stack: ship the rebuilt image to the VPS under the `ocu582-computer-use:<sha>` name, set `SANDBOX_IMAGE` to it, bring the stack up, run the download driver with the production `playwright-cli open <url>` from the default working directory (no config override, no `cd`), assert the file in `/mnt/user-data/files`, in the listing and the absence of `/home/assistant/.playwright-cli`; `pkill -f run-cli-server`, open again, repeat the click, same assertions; record the driver log and screenshots; tear the stack down and record the inventory.
- [x] 3.2 `./tests/test-project-structure.sh`; the commit hooks; after review is clean, the two-phase clean-clone evidence (no server change; it confirms nothing else moved).

## Risk packs

Selected:

- Compatibility: the relay regression (variable renamed, its own config now loaded) and the two existing spec scenarios run on the rebuilt image; the wrapper keeps the `${VAR:-default}` override; the build-time default file is left in place.
- Image contract: the resolved configuration is proven behaviorally in a bare container (entrypoint, `assistant`, `/home/assistant` and `/tmp`) and in the full stack (real download, no `.playwright-cli`, daemon restart).
- Documentation: skill docs match what the CLI prints and where files land.

Not selected:

- Server, auth, viewer, schema, dependencies, secrets, CLI version: unchanged.

## Recorded at archive

- Implemented by DankerMu/open-computer-use#160 (merge `34dc83c`, reviewed head `0fd79e2`; issue DankerMu/open-webui#582 closed; the last #197 evidence item ticked and #197 closed).
- Deviations from design.md: the wrapper injects its default only when no `--config` argument is present (round-1 finding: the daemon prefers the variable over `--config`, so the documented flag was silently ignored; fix pass 1 adds the scan, a third harness probe with `--config` from `/tmp`, and a SKILL.md sentence saying what a `--config` file replaces); the regression's cleanup reaps by owner label only; the regression prints its output on pass as well; the third probe asserts the cwd-relative link form `(own-output/page-…yml)`; the probe bounds rose from 360/400/420 s to 480/520/540 s for three iterations; `--browser-relay-only` is given after the image argument.
- Evidence: red on `ocu442-sandbox:8c23438` (73/1: `/home/assistant` snapshot under `.playwright-cli/`, `/tmp` the `chrome` distribution error; unmodified harness control 73/0 with the relay snapshots under `.playwright-cli/`); green on `ocu582-computer-use:7585eb3` (74/0) and, with the third probe, on `ocu582-computer-use:95ed972` (74/0, `(own-output/page-…yml)`); mutants A (variable reverted), B (channel pin removed) and C (unconditional export) each failed only the new check and were restored byte-identical; full-stack runs on the native Linux engine with both images (download in `/mnt/user-data/files`, listing and Files tab, no `.playwright-cli`, same after a daemon restart, `cd /tmp` open, real-stack `--config` probe), recorded in `docs/evidence/issue-582/`; structure, `bash -n`, pre-commit, `git diff --check`; clean-clone on `0fd79e2`: full 3705 passed / 6 skipped, CI form 2907 / 6 / 3 subtests, `tests/deploy` 419, all exit 0.
- Review: round 1 two seats (one confirmed compatibility finding, `--config` silently overridden; test-evidence+spec no findings) → fix pass 1 → round 2 one seat, F1 closed, no regressions, one non-blocking P2 fixed as a docs-only commit. Deferred notes: `PWCLI_OWN_CONFIG` is not initialised before the scan; the probe covers the `--config=` form only; mutant C duplicates red; the wrapper argument matrix has no log.
- Open: a listing filter for CLI artifacts (`page-*.yml`, `console-*.log`, `traces/`) is not part of this change; sandboxes started before the image change keep their daemon configuration until it restarts.
