# Proposal

## Why

Issue #248 identifies a possible stale row glyph after a listing retains `file_id` but changes path and kind. A parent-executed trace of the exact harness pin `a53731df95a3b92acb2dcb5980f969b4f8b4ee52` confirms that an atomic, content-preserving `notes.txt` → `notes.html` rename retains identity, advances revision and changes type/MIME and ETag. The visible row failure must be established by a mounted regression before changing production rendering.

## What Changes

- Add a real component/controller regression comparing the changing row's rendered SVG with an unchanged known-kind control, while preserving row identity, selection and accessible naming.
- If the mismatch reproduces, update only the row's icon rendering, matching the existing dynamic selected-icon convention rather than remounting the row.
- Exercise the mounted browser surface through a test-owned chat and the existing scenario transition; retain screenshot, real HTTP behavior and existing isolation checks.
- Update the existing file-tree decision after runtime proof. No classifier, broker, preference, preview/edit or folder behavior change.

## Capabilities

### Modified Capabilities

- `ocu-workspace-files`: a reconciled file row must display the current kind without losing its selectable identity.

## Impact

Production seam: `src/lib/components/chat/WorkspaceArtifact.svelte` row icon only. Proof belongs in the existing tree component/browser suites and `docs/evidence/`; source-side trace is read-only apart from owned temporary files. Reuse current mappings, reconciliation, fixtures and verification commands; no new dependencies or harness configuration.

## Risk

Issue type: bugfix, gated by diagnosis.
Fixture level: expanded.
Upstream suggested level: absent; shared workspace entrypoint and stable-identity reconciliation cross a critical preview-host component.
Blast radius: stale or remounted file rows, lost selection/focus, misleading type display.
Selected risk packs: Concurrency / shared state / ordering; Legacy compatibility / examples; Error handling / rollback / partial outputs; Documentation / migration notes.
Evidence floor: pinned producer trace; mounted semantic RED before production edit; component and browser GREEN; frontend/static/coverage gates; A-T01 and zero unexpected browser errors; expanded review.
