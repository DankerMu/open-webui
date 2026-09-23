# Proposal

Issue type: feature
Fixture level: expanded
Upstream suggested level: expanded (agree; concurrency and shared lifecycle state)
Blast radius: duplicate containers, cross-chat credentials, implicit restart, or a resumed sandbox killed by a frozen timer.
Selected risk packs: Public API / CLI / script entry; Config / project setup; File IO / path safety / overwrite; Auth / permissions / secrets; Concurrency / shared state / ordering; Legacy compatibility / examples; Error handling / rollback / partial outputs.
Evidence floor: real-app/mocked-Docker lifecycle tests, two-process lock proof, semantic red, configured non-Docker suite and three-seat expanded review. Docker runtime evidence is deferred to epic task19.0.

## Why

Issue #13 makes explicit launch the only resume path and scopes sandbox credentials per chat. The user additionally requires multiple workers, pause-aware idle timing and no deletion on launch failure (issue comment 5774874611).

## What Changes

- **BREAKING**: non-running tool/MCP requests return SandboxStopped without starting or recreating a sandbox.
- Add combined per-chat locking for all lifecycle operations: stable process-local threading.Lock plus shared-filesystem flock. Preserve multi-worker startup.
- Add token-protected internal launch/describe. Restart/resurrect become launch aliases. Running launch is idempotent; launch returns200 only after observing running. Dead, timeout and engine refusal return explicit failure without deleting containers.
- Replace the frozen-sleep kill timer with host-owned pause-aware idle reclamation. OCU downtime suspends reclamation; tracking uncertainty grants a fresh idle window. Credentials and NO_AUTOSTART remain scoped by the specified policy.

## Capabilities

### New Capabilities

- `ocu-lifecycle`: explicit per-chat sandbox lifecycle, describe, credential composition and pause-aware retention.

### Modified Capabilities

None; parent sandbox-lifecycle remains the epic source, while this fixture records the user-approved implementation deviations.

## Impact

Sibling OCU docker_manager.py, lifecycle routes/aliases, auth guard for /internal, MCP/tool error translation, tests/orchestrator/test_lifecycle.py and minimal docs. No broker (#15), network detach (#20), WebUI route/CONTEXT wording (#7), retention script comment (#26) or Docker execution.
