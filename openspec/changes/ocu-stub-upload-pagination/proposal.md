# Proposal

## Why

Issue #210 identifies a verification gap: ordinary-chat uploads do not exercise an upload beyond the first 100 fixture rows, or distinguish readable bytes from an intentionally failed listing page. The existing `large` and `partial_after` stub behavior is the accepted reference, not a product defect to fix. Dependency #117 is closed.

## Risk triage

- Issue type: test; fixture level: expanded.
- Upstream level: absent; expanded because scenario-map setup affects a shared smoke process and interacts with asset-mode configuration.
- Mode: Characterization; qualify the new oracle with reference GREEN, targeted semantic mutations and restored GREEN.
- Blast radius: local stub smoke only; stub and production implementations remain byte-identical.
- Selected packs: script entry, fixture configuration/lifecycle, shared state, pagination boundary, compatibility, partial errors, documentation.
- Evidence floor: real HTTP `make smoke-stub`, two discriminating disposable mutants, cleanup/input identity, scoped docs/static checks and three-seat review.

## What Changes

- Add scenario-mapped smoke chats for `large` and `partial_after`.
- Verify successful page-two visibility separately from the intentional partial-page 503 and byte retrieval.
- Retain ordinary upload and Office smoke coverage without changing fixture ordering or behavior.

## Capabilities

### Modified Capabilities

- `ocu-stub`: the smoke distinguishes complete and intentionally partial upload listings.

## Impact

Only `scripts/smoke-stub.sh` and owning documentation/evidence. No stub implementation, production, UI, proxy, dependency or fixture-order change.
