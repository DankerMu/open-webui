## Context

`TerminalDashboard.uploadFile` creates one hidden multiple-file input and awaits each POST/body read serially. It never checks `Response.ok`; rejection bypasses input removal and the listener's promise escapes. Standalone supplies a Files-refresh callback; terminal embedding does not. The existing request wrapper deliberately returns native fetch responses.

## Decision

Repair this one handler, not the wrapper or two mount sites. Use local dashboard error state and an accessible visible error beside the upload action, following existing locale and color conventions. Check HTTP success before accepting completion; catch network/body-read rejection and always remove the selected input in finally. Render feedback as text, not server-supplied HTML or raw response details. Name the failed file and provide retry guidance; an HTTP status may distinguish a server refusal from a connection failure.

Keep sequential selection processing. Stop at the first failed request, matching the existing network-rejection stop behavior; do not automatically retry, roll back earlier successful files, or claim the batch completed. The all-success path still calls dashboard refresh and the optional standalone Files callback. Clear stale upload feedback when a new selection attempt starts so a later successful upload does not retain the old failure. Guard component state with its existing mounted lifetime rather than introducing a second controller system.

A callback refresh is not evidence of upload success. Tests must correlate POST results with the expected refresh requests and prevent standalone polling from impersonating the Files callback, using the existing harness control. Previously completed files in a failed selection remain completed; no transactional batch guarantee is introduced.

Governing invariant: a rejected upload never appears silently successful, settles without an unhandled rejection, and releases its selected temporary input; successful uploads preserve both consumers' existing refresh contract.

Sibling surfaces: standalone terminal panel, `embed=terminal`, shared request wrapper, dashboard status fetch and standalone Files callback. Endpoints, authentication/provenance headers, encoded filenames, no-upload-list/manifest behavior and other runtime modes remain unchanged.

## Verification

Extend `tests/orchestrator/preview_embedding_browser.cjs` in place. Use its captured production preview HTML and real Preact modules; native recorded HTTP4xx/5xx and a deterministic browser request abort/rejection. Exercise both mounted surfaces, assert visible localized feedback, input removal and no unhandled page error. Correlate expected browser HTTP/network diagnostics only to the injected upload; reject other console/page errors. Preserve existing successful-upload checks and add failure-to-success error clearing, without relaxing the harness's unrelated assertions.

Parent runs browser semantic RED before production edits, then the browser harness, owning preview Python regressions, screenshots and central `make verify-ui` baseline after implementation. Source-browser screenshots prove the changed UI; WebUI's pinned baseline is not source-change certification. Independent expanded correctness, test-evidence/spec-compliance and invariant-state review follows proof.

## Non-goals

No retries, progress UI, batch queue redesign, storage/endpoint changes, global fetch-status policy, source repin, image or LAN acceptance. Picker cancellation and a new abort-on-unmount upload protocol are not added to this selected-input failure fix. No raw server-body error rendering.

Rollback reverts static assets; no persistent state or data migration.
