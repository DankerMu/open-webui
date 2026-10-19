# Proposal

## Why

Issue #314 reports complete SVG geometry clipped by the ordinary Drawio host. A real-browser boundary probe measured a 4px right-stroke overrun; single-variable interventions confirmed that decorative host padding conflicts with the viewer-owned automatic size box under the existing border-box reset.

## What Changes

- Give only the ordinary viewer host a content-box sizing contract, preserving padding needed for nonzero initial width and leaving global CSS, overflow policy, SVG geometry and controls unchanged.
- Extend existing browser geometry assertions to cover the visible painted boundary, selection/revision transitions and interactive controls.

## Capabilities

### Modified Capabilities

- `ocu-preview-spa`: ordinary Drawio previews show complete expected geometry and strokes without requiring fullscreen or manual reduction.

## Impact

- Issue type: bugfix
- Fixture level: expanded
- Upstream suggested level: absent
- Blast radius: shared ordinary Drawio host sizing across plain, compressed and multipage inputs
- Selected risk packs: Legacy compatibility / examples; Concurrency / shared state / ordering; Error handling / rollback / partial outputs; Documentation / migration notes
- Evidence floor: stroke-aware real-browser RED/GREEN and screenshots; explicit selection/revision/control checks; unchanged fullscreen/theme lifecycle and full browser regressions

No vendor, global reset, tracker, sanitizer, resource authorization, other preview type, embedded Drawio or lifecycle redesign. No Linux/LAN certification.
