# Design

## Context

The existing SPA App owns selection; FilesView already isolates stale render stages. WebUI will own its file list and preferences, while this contract reuses OCU renderers. Source references: preview.js App/FilesView and ocu-request.js loadOutputsWindow; canonical ocu-preview-spa requirements remain authoritative for standalone behavior.

## Goals / Non-Goals

Enable a trusted same-origin parent to select a broker file_id and observe its preview outcome. No WebUI component, Browser/Terminal embedding, Office editing, arbitrary URLs, authentication bypass or real-engine execution.

## Decisions

- Opt in with `?embed=files`; absent embed keeps standalone mode. Unsupported/repeated embed values fail visibly without runtime clients. Embedded mode requires an actual parent window.
- Requests are exact objects `{type: "ocu:preview-select", chat_id, file_id, generation}`. chat_id must match shell configuration; file_id is a nonempty bounded string (maximum128 characters); generation is a nonnegative safe integer, strictly increasing for this iframe. Unknown keys/types are rejected. Only `event.source === window.parent` and `event.origin === location.origin` are accepted, never opaque `null` origins.
- After installing its listener, the embedded SPA sends `{type: "ocu:preview-ready", chat_id}` to the parent with exact origin. Responses are `{type: "ocu:preview-state", chat_id, file_id, generation, state}` where state is loading/ready/error/missing/unsupported. No raw error text, URLs, file bytes or credentials cross this channel. A parent must also check source/origin and current generation.
- Resolve file_id through the chat's authorized outputs listing using existing coherent-page machinery. Resolution is bounded by 100 pages and a 10-second overall deadline; exhaustion or incomplete/error chains report error, never missing. Finding a matching identity may end resolution after its coherent page; missing requires complete coherent enumeration. Broker metadata supplies the URL, whose same-origin configured chat file path is checked before rendering; parent-supplied metadata is forbidden.
- Embedded mode has no autoselection, file-navigation chrome, polling, heartbeat, CLI badge, BrowserView or TerminalView. A newer request clears old visible selection and invalidates prior listing/render completions. The parent re-requests the same file_id with a higher generation after revision/deletion hints; only this explicit request triggers re-resolution. WebUI owns reconciliation in issue29/32.
- Reuse FilesView/renderPreviewContent and existing Office rendering. This embedding contract supports broker types docx/xlsx/pptx only; all other types report unsupported. Additionally reject MIME essence text/html, image/svg+xml, application/xhtml+xml, application/xml, text/xml and any +xml suffix regardless of type. Thus svg-as-image, xhtml-as-other, xml-as-code and drawio are explicitly refused; standalone support is unchanged.
- Ready means successful Office rendering completed, not that a catch returned fallback markup. Corrupt Office reports error with a visible failure indication. WebUI owns the usable download button using its own broker listing; the channel carries no URL. Browser proof mounts the trusted iframe with exactly `allow-scripts allow-same-origin allow-forms`, without adding allow-downloads or promising in-iframe download capability.
- User-approved security repair: vendor DOMPurify3.4.16 locally with license and registry integrity provenance; no CDN or dependency upgrades. Sanitize document-converted HTML at the canonical Office DOM insertion boundary, including standalone consumers of that same renderer. Preserve normal text, tables and supported inline images; reject executable elements, event attributes, unsafe navigation schemes and document-controlled embedded style-map output that escapes the approved HTML subset. Do not merely intercept clicks or blacklist the demonstrated javascript link. Define and test safe link/image behavior; document-supplied external resources must not silently initiate credentialed requests.
- A generated-content child or unrelated sibling cannot issue selection commands. Existing iframe-link-click handling must not bypass the embedded parent-only contract or change selection in embedded mode.

## Risks / Trade-offs

Large listings may exceed bounded resolution and produce explicit error rather than false tombstones. Browser proof must use real renderer assets, valid and corrupt Office fixtures, and delayed completion; mocked renderer success is insufficient. Existing renderer security is not widened: selection never accepts arbitrary HTML or URLs.

## Migration Plan

No schema migration or new route. Deploy OCU first, then consume this documented protocol in WebUI issue29. Removing the opt-in mode reverts the integration without changing standalone clients; do not change the pinned proxy-smoke commit merely because OCU main advances.
