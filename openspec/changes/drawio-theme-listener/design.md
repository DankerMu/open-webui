# Design

## Context

The fixed upstream GraphViewer registers one `darkModeChanged` callback synchronously inside `showLocalLightbox`. That callback closes over the returned EditorUi. Its removal API accepts callback identity, not an event name. The existing OCU wrapper already owns a child lifetime and one idempotent close handle shared by user close, render failure and stage retirement.

Source custody: upstream commit `0f419a92c769adb5fb20f2b18053a5ae8c7e4993`, GraphViewer Git blob `d2d68ca596b669534d225c97cfed8f911192a703`, served viewer SHA256 `41f8360963bb485db74517ae7ca8ca01e563b587607a82238f901750b14e26d0`. No generated asset edit or regeneration is needed.

## Decision

In `attachLocalLightboxGuard`, observe only the current receiver's synchronous `addListener` calls while invoking the pinned factory. Preserve forwarding receiver, arguments and return behavior. Restore the original method immediately in `finally`, including an exceptional factory return; never leave a global/prototype interceptor installed.

Bind the captured child callback to the existing child lifetime and remove only that callback via the parent's callback-only API. Removal participates in existing idempotent close/dispose; it must not clear all theme listeners, destroy the parent or suppress later theme events. If setup fails or returns no UI, relinquish any captured subscription rather than retaining newly owned observation state; preserve the original failure.

The child lifetime remains the owner rather than adding separate icon/Escape/backdrop fixes. A vendor patch would require updating the pinned archive/inventory and is unnecessary for this narrow integration seam.

## Must preserve and sibling surfaces

- Open popup theme updates and parent preview theme updates after child close.
- Other parent listeners and later fullscreen openings; repeated close stays idempotent.
- Existing deferred attachment, scrolling/resize restoration, newer-popup protection, render-failure close and all stage-retirement scenarios.
- Office/Markdown sanitizers and unsupported embedded Drawio behavior; pinned assets unchanged.

Governing invariant: a child UI's theme subscription exists only during its child lifetime, while unrelated parent subscriptions remain intact. Producer: pinned lightbox factory; storage: parent event source; owner: child lifetime; consumers: live UI theme updates; terminal paths: all existing close/dispose paths. Parent viewer and matchMedia final teardown remain outside scope.

## Executable proof

Extend the existing real browser harness, not a new viewer mock. First freeze one close-icon tracer that observes the actual parent and returned UI while faithfully forwarding vendor calls. Change real browser color-scheme preference (or dispatch the real parent event for deterministic post-retirement accounting), prove live child/parent theme state changes, close through the actual UI, then require no further calls into that retired UI. Record callback identity membership and preserve the pre-existing listener set.

The pinned viewer defaults `darkMode` to null and OCU does not override it. For observable light/dark DOM transitions, the browser fixture may select the viewer's existing `auto` mode as test input; disclose that input and leave production defaults unchanged. Default-mode event dispatch can still demonstrate whether a retired callback is invoked.

After first GREEN, cover Escape and backdrop, repeated open/close and stage retirement. Observe every retired UI across subsequent theme events, not only the latest one. Test-only observers must not add unrelated callbacks inside the factory capture window. Existing unrelated listeners or an explicitly added outside-window sentinel must survive. Record actual screenshots, errors, commands, source hashes and resource cleanup; run the complete browser harness and canonical preview-prefix regressions.

## Risks and delivery

Temporary interception can alter receiver/method state or leak on a throw: use bounded synchronous ownership and `finally`; review both setup and close failures without inventing a general viewer recovery policy. Parent custody is not OS isolation. No heap-release, other-browser or LAN certification.

After runtime proof update the existing local-Drawio-materials decision and OCU changelog. Rollback is the focused wrapper/test change; no migration or dependency change.
