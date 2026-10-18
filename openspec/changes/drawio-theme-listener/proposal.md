# Proposal

## Why

Issue #313 identifies a child fullscreen theme callback retained by the parent Drawio viewer after close. The pinned viewer's icon path passes the event name to a callback-only removal API; Escape and backdrop close do not remove the callback.

## What Changes

- Capture the fullscreen call's own theme callback in the existing local-lightbox wrapper and remove it by identity through the existing child lifetime.
- Verify actual browser theme propagation before and after icon, Escape, backdrop, repeated close and stage retirement.

## Capabilities

### Modified Capabilities

- `ocu-preview-spa`: fullscreen ownership includes its parent-held theme subscription, without disabling the parent preview.

## Impact

- Issue type: bugfix
- Fixture level: expanded
- Upstream suggested level: absent
- Blast radius: standalone Drawio child UI lifecycle
- Selected risk packs: resource lifetime, shared state/ordering, compatibility, error handling, documentation
- Evidence floor: real viewer semantic RED/GREEN; live/open and closed theme dispatch with exact callback ownership; all close paths and existing retirement/browser regressions

No vendor bundle modification, parent viewer/matchMedia teardown, stencil-tracker redesign, embedded Drawio support or geometry/cropping change. Static evidence is not a measured heap-leak claim.
