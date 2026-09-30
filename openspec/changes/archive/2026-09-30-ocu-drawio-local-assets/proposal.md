# Proposal

## Why

The standalone OCU Draw.io preview loads an external viewer, preventing offline deployment/runtime acceptance. Issue #97 supplies local materials before #33 packages images.

## What Changes

- Prepare a fixed upstream viewer release and its runtime resource closure before builds; verify source and output hashes, preserve upstream licenses, and use only local public-prefix asset URLs at runtime.
- Replace the external loader in place and expose honest asset/render failures.
- Preserve Files embedding's existing unsupported disposition for Draw.io and the Office/HTML/SVG/Browser/Terminal trust boundaries.

## Capabilities

### Modified Capabilities

- `ocu-preview-spa`: local Draw.io materials and honest standalone rendering.

## Impact

OCU preparation script/manifest, generated static assets, preview renderer, native browser tests, image material preparation hook and third-party notices; WebUI pinned OCU source and control-plane specification. No npm/uv upgrade or deployment lifecycle change.

Issue type: bugfix.
Fixture level: expanded; agrees with upstream issue.
Blast radius: archive extraction/publication, third-party viewer globals, offline preview and adjacent Office sanitizer.
Selected risk packs: script entry; config; file IO/path safety; auth/trust; concurrency/order; resource limits; compatibility; errors; packaging; documentation.
Evidence floor: pinned-byte verification, semantic failure counterexamples, native real-renderer screenshots with WAN denied, adjacent regression checks and independent review.

User decision: fixed third-party materials are downloaded and verified during online build preparation, not committed as approximately65 MB of raw files. Runtime/deployment remain offline; offline source rebuilding is not required. Docker execution remains deferred to #36.
