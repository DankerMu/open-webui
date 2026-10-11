## Purpose

Define browser CLI completion and relay lifetime so captured tool output terminates while the workspace browser viewer retains CDP access.

## ADDED Requirements

### Requirement: Independent browser relay lifetime

The sandbox browser CLI SHALL release captured standard streams when its foreground command completes. Its CDP relay SHALL remain available independently of those streams, forwarding `0.0.0.0:9222` to Chromium at `127.0.0.1:9223` without changing command arguments or the established HTTP navigation interception window.

#### Scenario: First captured browser open

- **WHEN** a fresh sandbox with no existing relay runs `timeout 15s bash -c "playwright-cli open about:blank 2>&1 | head -40"`
- **THEN** the command exits zero before the deadline and reports an opened browser at `about:blank`
- **AND** the relay continues serving Chromium CDP after the captured command returns

#### Scenario: Existing relay and HTTP navigation

- **WHEN** another browser CLI command uses an existing relay or opens an HTTP URL
- **THEN** existing relay discovery, argument forwarding, and the open/interception-window/goto sequence retain their behavior
