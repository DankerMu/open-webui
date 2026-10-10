# Design

## Context

The stage lifetime already owns children, subscriptions and stencil guards. The local viewer appends fullscreen backdrop, close control, diagram and toolbar to `document.body`; its `ui.destroy` removes them and restores the captured body overflow state. Guard disposal and normal destroy currently flow in only one direction. See proposal.md for scope.

## Decisions

- Keep the pinned upstream viewer unchanged. Register an owned close handle on the existing fullscreen child lifetime instead of relocating vendor DOM or adding a second modal implementation.
- Normal close, Escape, renderer-failure closure and stage retirement share one completion state. Reentrant disposal or a later close cannot invoke the original destroy twice.
- Retiring one lifetime closes only its own fullscreen UI. New selection and later reopened fullscreen remain usable; do not remove body nodes by a global selector.
- Preserve guard/subscription/tracker cleanup and page/zoom/image/stencil behavior. Do not expand into global viewer-tracker teardown.
- The upstream fullscreen mount schedules deferred body attachment. A retirement during that boundary must not let old UI reappear or throw during cleanup; test that ordering rather than assuming creation is fully synchronous.

## Governing invariant and seams

Governing invariant: no body-owned fullscreen UI may remain usable or reappear after its owning preview stage retires, and that UI closes at most once.
Sibling surfaces: FilesView empty/replaced stages, listing auto-selection, file_id-preserving rename, revision refresh, removal/fallback, normal close/Escape, fullscreen render failures and delayed body attachment.
Seams under test: real mounted standalone SPA, file-selector DOM events, actual listing reconciliation, actual local viewer controls and browser DOM/scroll state. No direct assignment to component selection state.

## Evidence boundaries

- Explicit selection: open diagram A fullscreen, activate B through the mounted file selector, verify A's body nodes are gone and B renders and accepts viewer interaction.
- The upstream fullscreen backdrop covers the toolbar's pointer hit region. A DOM-activated existing selector may exercise its real event path without pretending the covered selector is physically pointer-accessible. Do not alter fullscreen stacking or add new navigation UI to obtain that test.
- Listing transitions are independent cases: new-file auto-selection, same-file_id rename, revision change, removal with replacement, and empty listing. Each must retire the old modal through actual refresh/reconciliation, not a direct dispose call.
- Normal close button and Escape restore the captured overflow state; repeated open/retire/reopen and retirement during deferred mount leave no stale modal or unexpected errors.
- Retain existing resource-failure, page-switch, zoom, Office/Markdown isolation and embedded-refusal controls. Screenshots complement node/content/interactivity assertions.

## Risks and migration

Destroy/dispose recursion and deferred vendor mount are the main risks; completion state and browser ordering controls must cover both. No schema or configuration migration. Rollback is a reviewed revert and restores the known lifecycle defect.
No dependency upgrade, vendor-bundle patch, fullscreen disablement, WebUI UI change, embedded support, generalized tracker audit or deployment certification.
