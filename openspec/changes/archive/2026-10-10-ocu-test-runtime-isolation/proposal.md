## Why

Inherited network mode, bind address, and CLI selection reach module reloads in two environment-injection test modules. Fresh adverse-environment runs fail before the intended assertions: eight network-mode failures, eight gateway-mismatch failures, and nine invalid-CLI import failures.

## What Changes

Pin enabled networking and the fake gateway address in the existing test environment setup. Pin Claude for every runtime-importing unittest case in `test_docker_manager.py`; retain explicit Claude/Codex/OpenCode parameterization in `test_passthrough_isolation.py`. Restore the caller's environment after each case, including errors.

Use one small unittest fixture base for the three runtime-importing test classes, rather than duplicate setup or pytest-only setup that the file's unittest entrypoint would ignore. Keep the passthrough test's existing scoped override dictionary.

## Capabilities

No production behavior or product requirement changes. `skip_specs: true` records test-only fixture repair; no invented canonical spec delta.

## Impact

Issue: https://github.com/DankerMu/open-webui/issues/186

Issue type: test. Fixture level: compact. Upstream suggested level: absent.
Blast radius: two test modules only. Selected risk pack: concurrency / shared state (process environment isolation; no concurrent execution design).
Evidence floor: unchanged 13 focused assertions under clean and adverse environments; standalone unittest entrypoint; environment-restoration probe; full orchestrator/auth/deploy unit suites from the existing CI workflow.

No production guard changes, new skips, fake networking expansion, dependency or deployment changes. No design document: the only shared state is the test process environment.

## Workflow deviations

The parent applies the small test-fixture edit inline under the no-trivial-delegation rule; independent fixture and compact code review remain required. Installed OpenSpec `skip_specs` replaces the generic workflow delta requirement because no product behavior changes.
