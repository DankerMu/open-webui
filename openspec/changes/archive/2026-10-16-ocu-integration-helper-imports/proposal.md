# Proposal

## Why

Full OCU `tests/` discovery with `--import-mode=importlib` imports the integration modules' MCP helpers from the deploy conftest, so three integration modules fail collection before the real-image acceptance runs. The single-root invocation is already canonical; narrowing collection must not substitute for the required full command.

## What Changes

- Give the existing integration MCP request/response helpers an unambiguous maintained module and migrate every consumer without compatibility re-exports.
- Preserve fixture ownership, test node IDs, assertions, request semantics and Docker lifecycle.
- Record full and integration-only collection plus execution separately; retain the original failed acceptance receipt.

## Capabilities

### Modified Capabilities

- `ocu-pytest-discovery`: integration helper resolution under full-suite and focused discovery.

## Impact

OCU integration test support/imports and its test guidance/changelog; WebUI fixture/evidence only. No production, image, dependency, CI-policy or deployed-data change.

Issue type: bugfix (test infrastructure)
Fixture level: expanded
Upstream suggested level: absent; expanded for the shared test-discovery entrypoint.
Blast radius: integration modules disappearing or binding helpers from another suite.
Selected risk packs: CLI entry, config/setup, legacy compatibility, error handling, documentation.
Evidence floor: original collection failure; exact focused integration node-set preservation; canonical full discovery without integration import errors; real unchanged integration cases against the qualified batch images. Broader test failures remain visible and are not reclassified as success.
