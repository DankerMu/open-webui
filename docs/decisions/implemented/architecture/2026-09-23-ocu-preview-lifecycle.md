---
id: 2026-09-23-ocu-preview-lifecycle
title: Keep request provenance and rendered-stage ownership explicit
kind: architecture
status: implemented
date: 2026-09-23
supersedes: none
references: '2026-09-23-ocu-public-prefix; 2026-09-23-ocu-outputs-http-validators; issue17'
---

# Keep request provenance and rendered-stage ownership explicit

## Problem

The SPA mixes client-built OCU paths with server-emitted OCU and WebUI addresses. Polling also replaces metadata objects while an unchanged document and its asynchronous renderer must retain state.

## Decision

Use one request wrapper with explicit server-URL provenance; do not infer provenance from path namespaces. Move heartbeat into its managed SPA effect. Resolve assets and WebSocket paths from module location. Read the CLI badge only from the emitted WebUI describe URL.

Keep path plus entry revision as the render key and file_id as selection identity. Commit a complete same-revision page window only from the latest listing generation. Preserve hidden-mounted Files across tab switches. Each rendered stage owns its observer; a separate mount-lifetime teardown releases it and invalidates pending work. Same-key polls must not trigger teardown, and obsolete async completion may only dispose its own stage.

HTML srcdoc and real-file fallback use opaque sandbox tokens allow-scripts allow-forms. Generated HTML/SVG/XML file responses use framework-encoded inline disposition with the existing CSP; explicit download remains attachment. Office labels distinguish content previews from layout fidelity, and uncached XLSX formulas are visibly uncomputed.

## Alternatives considered

- **Guess all /api/v1 paths are server URLs** — invents routing policy and fails explicit provenance.
- **Unmount Files on tab switches** — resets worksheet and reading state; genuine component teardown can be tested directly without changing product behavior.
- **Clean observers on every effect rerun** — ordinary unchanged polls disconnect active render resources.
- **Use body-read entry as rendering evidence** — does not prove the render continuation settled; observe the real completion chain and qualify against a stale-commit fault.

## Consequences

OCU PR11 merged at0827f99 after expanded review and two user-authorized gate extensions. Parent suite649 passed/5 skipped and real browser evidence covers refresh, paging, proportional slides, genuine unmount and old-render completion. Screenshots and reports are in docs/evidence/issue-17. Host proxy dependency stubs do not establish production proxy or Docker acceptance; those remain#36.
