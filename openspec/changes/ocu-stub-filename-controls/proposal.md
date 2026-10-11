# Proposal

## Why

Issue #209 identifies decoded control characters reaching the local stub's `Content-Disposition` header after an accepted upload. Reject unsafe names before state mutation rather than changing how accepted names are displayed.

## Risk triage

- Issue type: bugfix; fixture level: expanded.
- Upstream level: absent; expanded because upload parsing feeds response headers and shared state.
- Blast radius: local HTTP stub and its smoke consumers, not production OCU.
- Selected packs: script entry, path/name validation, shared-state mutation, compatibility, error handling, documentation.
- Evidence floor: real HTTP semantic RED/GREEN, raw header framing for inline/download responses, scoped static/docs gates, three-seat review.

## What Changes

- Reject decoded ASCII HTTP controls U+0000–U+001F and U+007F before upload storage, retaining the stub's invalid-filename 400 response.
- Extend the existing smoke with unchanged-listing assertions and ordinary-file disposition controls for inline and `download=1`.

## Capabilities

### Modified Capabilities

- `ocu-stub`: upload filenames cannot introduce HTTP control bytes into file disposition headers.

## Impact

`scripts/ocu-stub.py` and `scripts/smoke-stub.sh`, plus owning documentation. No production files, dependency changes, broader Unicode/header-quoting policy or OCU 400/403 parity changes.
