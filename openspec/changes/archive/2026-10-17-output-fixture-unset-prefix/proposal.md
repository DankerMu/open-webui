# Proposal

## Why

Issue344 identifies a latent output-test fixture mismatch: `prefix=None` removes a key from a copied mapping, but updating the live environment leaves an inherited public prefix in place. Root-prefix test requests can therefore use inherited routes or fail import instead of selecting the intended root configuration.

## What Changes

- Explicitly remove the live `OCU_PUBLIC_PREFIX` when the output fixture selects `None`, after applying its prepared environment and before importing the app.
- Preserve explicit empty-string and `/ocu` modes and the existing complete-environment/selected-module restoration boundary.
- Prove real static and generated output URL behavior under inherited configuration and exact state restoration after normal and intentional failing contexts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-outputs-test-isolation`: output fixture prefix selection is independent of inherited prefix configuration and restores prior process state.

## Impact

OCU `tests/orchestrator/test_outputs_endpoint.py` and focused fixture regressions; WebUI owns this fixture/evidence. No production prefix parser, route, security assertion, module-graph redesign, sibling preview fixture or dependency changes.

## Fixture Contract

Expanded level: process-global environment and module objects cross import/client lifetimes. Selected packs: config/project setup, API/path compatibility, state/concurrency isolation, error recovery, test evidence and documentation. No production auth/schema/persistence/performance/deployment changes. The current user-authorized queue includes344; the issue's older separate-approval note does not narrow that later authorization.
