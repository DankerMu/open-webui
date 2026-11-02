---
id: 2026-11-02-ocu-sidebar-file-preview
title: Sidebar previews common files through the parent and a widened files frame
kind: architecture
status: implemented
date: 2026-11-02
supersedes: none
references: 2026-09-27-ocu-restricted-office-embedding, 2026-09-30-ocu-local-drawio-materials, issue-689, openspec/changes/ocu-workspace-file-preview, DankerMu/open-computer-use#198
---

# Sidebar previews common files through the parent and a widened files frame

## Problem

The workspace sidebar previewed only generated HTML/SVG/XML and Office files (#689). PDF, raster images, text, Markdown, CSV, source code, audio and video reached the download fallback, although the OCU file route serves them inline with their real MIME type. [Office embedding](2026-09-27-ocu-restricted-office-embedding.md) admitted only DOCX/XLSX/PPTX into the `embed=files` frame, which shares WebUI's origin, runs scripts and has no CSP. Widening it puts model-controlled text on the WebUI origin.

## Decision

WebUI picks one preview per selected file in `workspacePreviewRoute`, in this order: editor, office, generated, image, pdf, embedded, download. It reads the broker type and MIME essence only, never the display kind or the name. Every route after editor requires a servable file, so a file marked `too_large` or `unsupported_name` reaches the download fallback without a byte requested.

Raster images (PNG, JPEG, GIF, WebP, BMP) render in the parent as an `<img>` and PDF in WebUI's own `PDFViewer` in single-page mode, both from the `?revision=` URL and keyed on `file_id:path:revision`. Neither enters the frame. An image load error or a PDF fetch failure shows neutral failure copy with the parent's download.

`embed=files` additionally admits the Markdown, code, text, spreadsheet (CSV/TSV), audio and video broker types, under the unchanged sandbox and message checks. It refuses generated MIME types (HTML, SVG, XHTML, XML and any `+xml`) whatever the broker type, and refuses `too_large` and `unsupported_name`. Embedded Markdown is static: no Mermaid or KaTeX, images only from inline raster data or the chat's files path (no query, no archive route, at most 100), and only same-document fragment links stay active. Embedded Markdown, CSV/TSV and code have parse-time size limits; failed loads and undecodable media report `error`; embedded audio and video offer no download link. The frame's non-Office copy is neutral, and its error, missing and unsupported states show the parent's failure view with download, which is also what a newer WebUI shows against an older OCU.

Upstream `PDFViewer.svelte` changes so it can render model-generated PDFs in the narrow column:

- the single-page width floor drops from 320px to 80px, so a page is not cropped;
- the toolbar is capped at the viewer width and scrolls horizontally, so every control stays reachable;
- `getDocument` receives `isEvalSupported: false`, matching OCU's loader;
- one load runs per source: an in-flight load counts for the dedupe, and a superseded load destroys its document instead of overwriting the current one.

## Alternatives considered

- **Render PDF in the files frame** — the frame is limited to escaped or sanitized text; WebUI's pdf.js viewer already renders PDF in the parent.
- **Keep diagrams, math and remote images in embedded Markdown** — Mermaid and KaTeX write after sanitizing, and remote images leave from the employee's browser, on a frame without CSP; the standalone page keeps them.
- **Route by display kind or file name** — the display kind is a presentation choice, and a name can claim any type; the broker type and served MIME are what OCU actually serves.
- **Raster images through the frame** — an `<img>` in the parent cannot execute anything and needs no message round trip.
- **Keep PDFViewer unchanged** — the 320px floor cropped the page, the toolbar was clipped at both ends of a ~195px column, and the double load leaked a pdf.js document per mount.

## Consequences

Model-controlled text now renders on the WebUI origin, so the embedded renderers' sanitizing and the static Markdown rules are part of WebUI's trust boundary. Audio and video seek only within what is buffered, because the file route ignores Range. `FileItemModal` shares `PDFViewer` and gets the same load, hardening and toolbar changes. PDF thumbnails (`PdfPagesPreview.svelte`, `src/lib/utils/index.ts`) call `getDocument` directly and are unchanged. Drawio, HTML and other types stay unsupported in Files-only embedding without fetching their content. Browser evidence uses the OCU stub and real pdf.js; it is not a real-model or deployment certification.
