# Design

## Context

The existing unittest base pins network/bind/CLI configuration but not the data root. Three paths reload `docker_manager` and restore a captured root before the body; the environment-injection path also supplies a shared fallback directory. Earlier imports therefore determine the actual metadata destination. Production metadata uses the module's cached root.

Governing invariant: every test metadata write belongs to the active fixture's private root; teardown retires that root and restores the caller's data-root authority.

Sibling surfaces: the three reload paths, direct `unittest.main()`, pytest collection/execution, cached `docker_manager`, the reloaded `outputs_broker` consumer, real container metadata writes and caller environment. Existing Office/output fixtures restore their prior roots in teardown; they are regression consumers, not repair targets.

## Goals / Non-Goals

Preserve all existing test methods/assertions, mock Docker only at the existing boundary, and keep real directory/metadata behavior. Scope restoration to data-root state affected by this change; do not redesign all module-global runtime settings or unrelated contextvars.

No production `/data` changes, network/CLI policy changes, real Docker contact, live data inspection/removal, dependency upgrades, or full-suite claim. The reported original failure is accepted evidence, not rerun against unowned `/data`.

## Decisions

Extend the existing unittest ownership seam rather than require a caller export or create a second test harness. Allocate a unique temporary directory before any test-controlled Docker-manager import; make both environment and cached root authoritative during the test, including after reload. Register teardown before risky work; restore only saved prior state after the body and remove only the allocated directory. Remove the immediate-restoration/shared-fallback pattern from every reload path in this module. Reuse standard unittest cleanup/context mechanisms for assertion and setup-failure safety.

A preloaded module may already hold `/data` while the environment is absent or points elsewhere: preserve these two prior values independently. A first import must not leave a cached root pointing at a removed private directory after teardown. Preserve relevant existing module identity for sibling references; do not solve this by indiscriminately deleting or reloading unrelated modules.

Parent owns an independent private-process oracle before implementation. It delegates real filesystem operations only inside its private root and refuses other test write attempts before side effects, so the known bad path is observed without touching `/data`. Observe actual metadata contents and directory ownership, not just patched constants. Cached-root and caller-canary cases verify restoration after success and injected body failure. Freeze oracle and source hashes before the implementer changes fixture logic.

## Risks / Trade-offs

- Late ownership setup leaves cached state authoritative: exercise preload plus standalone paths.
- Early restore redirects writes: assert real metadata paths and content during the body.
- Failed body skips cleanup: run unittest failure control and inspect state after cleanup.
- Pytest discovery changes fixture scope: use canonical `tests/ --import-mode=importlib --ignore=tests/integration` with an explicit module filter; preserve exact selected node IDs.
- Shared OS identity is not an OS-enforced verifier enclave; report hash-bound parent oracle custody without claiming stronger isolation.

## Migration and Rollback

No runtime migration. OCU source/test-doc PR and WebUI fixture/evidence companion merge with empty automatic closing sets; archive and manually close319 afterward. Rollback is the focused test-fixture commit, not deletion of any external data.
