# Design

## Context

The full-root verification command is `python -m pytest tests/ -q --import-mode=importlib`, including integration. README and CI also expose the console entrypoint `pytest tests/integration/ -v` with default prepend imports. Both are supported boundaries. Three integration modules originally imported reusable functions from a top-level `conftest`, whose identity is not unique when deploy and integration are discovered together. The retained failure resolves that name to `tests/deploy/conftest.py`. The first candidate's absolute namespace import fixed importlib discovery but broke the console entrypoint; both RED receipts remain evidence.

## Goals / Non-Goals

- Governing invariant: collection scope cannot change the identity or behavior of integration MCP helpers, fixture ownership or selected cases.
- Source scope: the three integration consumers, their current conftest, one canonical support module, an integration-local package marker if required, and existing test guidance/changelog. Do not change the root tests namespace.
- No production route/auth changes, Docker recipe changes, dependency pins/upgrades, global import aliases, path-order tricks, deleted cases or weakened assertions.
- The earlier canonical root/orchestrator selection contract remains unchanged. Its historical prohibition on fixture repair does not require keeping reusable non-fixture helpers in conftest.

## Decisions

Move reusable helpers out of conftest and import them through an unambiguous module identity, following existing test support conventions. Keep pytest fixtures in their existing owner. A caller-local copy or `sys.modules['conftest']` shim would preserve discovery-order coupling or duplicate behavior, so neither is acceptable.

Audit all callers of the moved functions. Preserve their JSON/SSE response parsing and credential-bearing request construction exactly; no export alias remains at the old location.

## Evidence and Risks

- Wrong module/import selection: full-root importlib and focused console/default-prepend collections must complete without errors, without a PYTHONPATH override.
- Lost cases: preserve exact raw focused node IDs before/after for each invocation. For cross-invocation equality, strip only the full-root `tests/integration/` prefix and record the raw-to-integration-relative mapping; pytest's focused configuration uses a different rootdir. Never drop test/parameter suffixes or compare counts alone.
- Changed helper behavior: compare moved helper ASTs and run the real integration cases, with existing assertions unchanged.
- Full-suite failures outside this import boundary remain failures. Do not hide them with ignores, filtering or a different import mode.
- Record command/source/environment identities. The already built full images can be reused only if their actual build inputs are unchanged.

Rollback is a normal revert of this atomic test-only change; no persisted state migration exists. Review focuses on helper identity, fixture ownership, exact selection and evidence boundaries.
