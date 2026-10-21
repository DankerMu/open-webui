## ADDED Requirements

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
