# Tasks

## 1. Restricted embedding

- [ ] 1.1 Add explicit Files-only mode and exact parent protocol on existing preview seams; source/browser tests reject wrong origin/source/chat, malformed payloads, duplicate/lower generations and unsupported metadata pairs including svg-as-image, xhtml-as-other, xml-as-code and drawio.
- [ ] 1.2 Resolve selected file_id through bounded coherent pagination with canonical same-chat URLs; test later-page identity, deleted identity followed by a higher-generation parent request, incomplete/error/cursor churn and page/time limits without false missing.
- [ ] 1.3 Reuse existing renderers with honest result propagation and stale-generation isolation; real browser valid/corrupt Office and delayed render cases under sandbox="allow-scripts allow-same-origin allow-forms" prove visible content, error notification for the parent's download fallback and latest-only results.
- [ ] 1.4 Suppress runtime clients/effects in embedded mode and clean up owned listeners/timers/observers; browser request/event evidence proves no heartbeat/status/launch/ttyd effects and standalone regressions remain green.
- [ ] 1.5 Apply user-approved pinned DOMPurify at canonical converted Office HTML sinks; real malicious DOCX link/style-map tests remain inert while normal content/table/inline-image and approved link behavior survive. Verify vendored asset integrity/license and no remote runtime load.

## 2. Qualification and delivery

- [ ] 2.1 Parent runs focused source and browser checks, screenshots with no unexpected console errors, semantic faults in disposable Git-only exports and relevant non-Docker regression; no real Docker or privileged host changes.
- [ ] 2.2 Publish protocol/integration instructions and decision rationale, pass expanded fixture/implementation reviews and exact-head CI, merge source/control and archive; issue29 consumes the merged interface, issue36 owns real-engine acceptance.

## Risk mapping

Trust boundary:1.1/1.2; concurrency:1.2/1.3; lifecycle:1.4; failure/compatibility:1.2–1.4; documentation:2.2. Browser evidence uses real SPA and renderer assets, not a substitute implementation. Parent owns execution; implementation leaves skip validation per workflow constraints.
