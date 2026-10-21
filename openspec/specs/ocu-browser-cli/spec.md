# ocu-browser-cli Specification

## Purpose

Define browser CLI completion, relay lifetime and configuration loading so captured tool output terminates while the workspace browser viewer retains CDP access, and so every session loads the production configuration (or a caller-supplied one) with its outputs in the workspace files directory.

## Requirements

### Requirement: Independent browser relay lifetime

The sandbox browser CLI SHALL release captured standard streams when its foreground command completes. Its CDP relay SHALL remain available independently of those streams, forwarding `0.0.0.0:9222` to Chromium at `127.0.0.1:9223` without changing command arguments or the established HTTP navigation interception window.

#### Scenario: First captured browser open

- **WHEN** a fresh sandbox with no existing relay runs `timeout 15s bash -c "playwright-cli open about:blank 2>&1 | head -40"`
- **THEN** the command exits zero before the deadline and reports an opened browser at `about:blank`
- **AND** the relay continues serving Chromium CDP after the captured command returns

#### Scenario: Existing relay and HTTP navigation

- **WHEN** another browser CLI command uses an existing relay or opens an HTTP URL
- **THEN** existing relay discovery, argument forwarding, and the open/interception-window/goto sequence retain their behavior

### Requirement: Production browser CLI configuration

The sandbox browser CLI SHALL load the image's production configuration for every session, from any working directory, by exporting the configuration file path in the variable the CLI reads (`PLAYWRIGHT_MCP_CONFIG`) with an operator override of the same form as before. The production configuration SHALL pin the chromium browser and channel and SHALL keep `outputDir` at `/mnt/user-data/files`, so downloads, snapshots, traces and console logs land in the workspace files directory and appear in the workspace listing, and nothing is written under `<workspace>/.playwright-cli/`. The relay lifetime, the `open`/`goto` split and argument forwarding of the requirement "Independent browser relay lifetime" SHALL hold unchanged; a caller that supplies its own configuration file through the variable or through `--config` SHALL have that file loaded, the wrapper injecting its default only when no `--config` argument is present.

#### Scenario: Snapshot from the home and from an unrelated working directory

- **WHEN** a fresh container started through the image entrypoint as `assistant` runs `playwright-cli open about:blank` and then `playwright-cli snapshot`, once from `/home/assistant` and once from `/tmp`
- **THEN** each `open` reports an opened `about:blank` page with no `Chromium distribution` error, each snapshot file exists under `/mnt/user-data/files/`, and neither `/home/assistant/.playwright-cli` nor `/tmp/.playwright-cli` exists

#### Scenario: Download through the workspace browser

- **WHEN** a user clicks a download link in the BrowserViewer of a running sandbox whose browser was opened with `playwright-cli open <url>` and no manual configuration step
- **THEN** the file is written to `/mnt/user-data/files/`, appears in the workspace listing, and `/home/assistant/.playwright-cli` does not exist

#### Scenario: Daemon restart keeps the configuration

- **WHEN** the browser CLI daemon is stopped and `playwright-cli open <url>` is run again in the same sandbox
- **THEN** the next download lands in `/mnt/user-data/files/` as before

#### Scenario: Caller-supplied configuration

- **WHEN** a caller sets `PLAYWRIGHT_MCP_CONFIG` to its own file before running the browser CLI (the relay regression does this with `/tmp/relay-playwright.json`)
- **THEN** that file is loaded instead of the production one, and the relay regression's captured-open scenarios pass with it

#### Scenario: Caller-supplied configuration through --config

- **WHEN** a caller runs `playwright-cli open about:blank --config=<file>` from an unrelated working directory with a file whose `outputDir` differs from the production one
- **THEN** that file is loaded instead of the production configuration, the snapshot link points into its `outputDir`, nothing is written under `/mnt/user-data/files` for that session, and no `.playwright-cli` directory appears
