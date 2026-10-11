# Proposal

## Why

Issue #208 identifies a harness-only collision: uploading `backend403` or `backend409` masks the synthetic error with uploaded bytes. Mixed upload/proxy scenarios must preserve both the deterministic error fixture and access to accepted uploads.

## Risk triage

- Issue type: bugfix; fixture level: expanded.
- Upstream level: absent; expanded because the stub shares upload/name-allocation state with Office fixtures.
- Blast radius: local stub smoke and proxy/UI fixture consumers, not production OCU or WebUI.
- Selected packs: script entry, overwrite/names, shared state, compatibility, error handling, documentation.
- Evidence floor: semantic RED then GREEN `make smoke-stub`, scoped static/docs gates and three-seat review.

## What Changes

- Reserve the two exact synthetic names in the existing occupied-name source.
- Add a real HTTP mixed upload/error smoke regression, preserving uploaded retrieval and listing.

## Capabilities

### Modified Capabilities

- `ocu-stub`: synthetic error fixtures survive same-chat uploads.

## Impact

`scripts/ocu-stub.py` and `scripts/smoke-stub.sh`; no dependency, API schema, production route or UI changes. `backend-html403.html` and `partial_after` remain unchanged.
