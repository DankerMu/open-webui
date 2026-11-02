## Why

(#689.) The workspace sidebar previews only HTML/SVG/XML and Office files. PDF, PNG, JPEG, text, Markdown, CSV, JSON, source code, audio and video all reach `WorkspaceDownloadFallback` (`WorkspaceArtifact.svelte:640-720`). The OCU file route already serves them inline with their real MIME type, and `renderPreviewContent` already renders most of them, but `embed=files` admits only DOCX/XLSX/PPTX (`preview.js:2399-2401`).

## What Changes

- **Raster images** (PNG, JPEG, GIF, WebP, BMP) display in the sidebar with `<img>`. SVG stays on the opaque-origin iframe.
- **PDF** displays with WebUI's existing `PDFViewer.svelte` (pdfjs-dist 5.5).
- **Text, Markdown, CSV/TSV, JSON, source code, audio and video** display through OCU's existing `embed=files` iframe and `ocu:preview-*` protocol, with the type allowlist widened.
- **Embedded Markdown is static.** The frame shares WebUI's origin and has no CSP, so embedded mode runs no Mermaid or KaTeX, strips remote images, and keeps only same-document links. Standalone preview keeps these features.
- **Embedded failures are honest.** Embedded renderers report `error` for a failed load or a media decode failure instead of `ready`, and the code renderer stops interpolating a file extension unescaped into trusted HTML.
- **Preview hardening.** `escapeHtml` escapes quotes as well, and the PDF loader passes `isEvalSupported: false`.
- **OCU MIME.** `.webp` resolves to `image/webp` in the server image, which has no `/etc/mime.types`, so it reaches the image route.
- **Docs.** `computer-use-server/README.md` files-only section, `CHANGELOG.md`, and the decision record `docs/decisions/implemented/architecture/2026-09-27-ocu-restricted-office-embedding.md`, which still says Office only.

## Non-Goals

- PDF does not go through `embed=files`: WebUI's viewer already renders it, and the frame stays limited to escaped or sanitized text.
- No vendored-library upgrade.
- No iframe sandbox change, and no relaxation of HTML/SVG/XML isolation.
- `FileItemModal.svelte` is untouched.
- No HTTP Range support: `WorkspaceFileResponse` ignores Range, so audio and video seek only within what has been buffered.
- Mermaid, KaTeX, remote images and external links in embedded Markdown: the standalone page still has them.

## Fixture

```text
Issue type: feature
Fixture level: expanded
Upstream suggested level: absent
Blast radius: same-origin trusted frame now renders model-controlled text; a rendering hole runs script on the WebUI origin
Selected risk packs: Auth/secrets (trust boundary), Concurrency/ordering, Legacy compatibility, Error handling, Resource limits, Release compatibility, Documentation
Evidence floor: make test-frontend, make typecheck, make lint-scoped, make verify-ui-ocu, make decisions-verify; OCU preview_embedding_browser.cjs and tests/orchestrator
```

## Capabilities

### Modified Capabilities

- `ocu-preview-spa`: Files-only embedding admits text-like and media types.
- `ocu-workspace-files`: the sidebar previews common files.

## Impact

WebUI `src/lib/components/chat/WorkspaceArtifact.svelte`, `WorkspaceDownloadFallback.svelte`, their tests, i18n, `scripts/ocu_stub_nested.py`, the decision record. OCU `computer-use-server/static/preview.js`, `computer-use-server/app.py` (MIME), `computer-use-server/README.md`, `tests/orchestrator/`, `CHANGELOG.md`. Critical path: `WorkspaceArtifact.svelte`.
