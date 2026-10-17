# Proposal

## Why

Issue319 records standalone Docker-manager tests writing metadata under cached `/data`: reload helpers restore the old root before running the test. Test-owned temporary roots must remain authoritative until teardown without relying on caller configuration.

## Triage

- Issue type: bugfix (test fixture).
- Fixture level: expanded; upstream level absent.
- Reason: shared imported state and filesystem writes cross standalone and pytest lifetimes.
- Blast radius: test metadata outside its owner or stale root leaked to sibling tests.
- Selected risk packs: script entry, file IO, configuration, shared state, failure cleanup, compatibility, documentation.
- Evidence floor: protected filesystem oracle, actual standalone and pytest execution, cached-root and teardown controls, scoped regressions and docs gates.

## What Changes

- Keep a private data directory active across every reload and metadata write in the standalone test module.
- Restore prior data-root environment/module state and remove only fixture-owned data after each owning lifetime, including failed tests.
- Preserve existing credential, network, CLI, context and Docker-fake assertions.

## Capabilities

### Modified Capabilities

- `ocu-lifecycle`: standalone credential-injection verification owns its data-root lifetime.

## Impact

OCU `tests/orchestrator/test_docker_manager.py` and existing testing documentation/changelog; WebUI fixture and evidence. No production configuration, Docker operation, dependency, network/CLI fixture policy, or full-suite repair.
