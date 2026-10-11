# Bound frontend test discovery

## Why

Root Vitest invocations collect copied suites in ignored build snapshots. Issue #219 requires isolation without editing user-owned snapshots or losing official tests.

## Risk triage

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; shared test entrypoint triggers expanded.
Blast radius: frontend suite selection for Make, npm and coverage invocations.
Selected risk packs: script entry; config; file/path safety; discovery; compatibility; documentation.
Evidence floor: semantic discovery RED/GREEN, complete tracked-suite inventory, real Make/npm runs, coverage discovery parity, unchanged snapshot metadata, docs gates.

## What Changes

- Bound shared discovery to `src/` and `scripts/`, retaining Vitest's supported test filename families and default exclusions.
- Keep Svelte browser resolution and dependency inlining intact.
- Document the root policy and requirement to extend it when an official test root is added.

## Capabilities

### New Capabilities

- `frontend-test-discovery`: official frontend suite selection independent of unrelated snapshots.

### Modified Capabilities

None.

## Impact

Only test configuration in `vite.config.ts`; Make, npm and coverage remain consumers of one policy. No dependency or production behavior changes.
