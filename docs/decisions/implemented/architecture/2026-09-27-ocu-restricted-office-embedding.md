---
id: 2026-09-27-ocu-restricted-office-embedding
title: Parent-controlled Office embedding with sanitized converted content
kind: architecture
status: implemented
date: 2026-09-27
supersedes: none
references: 2026-09-23-ocu-preview-lifecycle, 2026-09-27-ocu-selected-runtime-embedding, issue-84, issue-29, issue-85, issue-310, issue-689
---

# Parent-controlled Office embedding with sanitized converted content

## Problem

WebUI owns selected file identity and preferences, while OCU owns Office rendering. Embedding the standalone SPA does not expose selection or reliable render outcomes. Duplicating the renderers creates a second implementation. Converted Office HTML is untrusted: a real DOCX hyperlink can carry executable script despite a valid broker identity and MIME.

## Decision

The existing authenticated preview route offers explicit `?embed=files` mode. It accepts only exact same-origin parent messages bound to the shell chat and increasing generation. Requests carry file_id, never URLs or bytes. The SPA resolves authorized broker metadata through coherent pagination, bounded to100 pages and10 seconds; incomplete/error enumeration is not deletion. Only DOCX/XLSX/PPTX, Markdown, code, text, spreadsheet, audio and video broker types with permitted MIME reach shared renderers; a file marked too_large or unsupported_name is refused. Canonical same-chat URLs follow the broker's path encoding.

Files-only embedded mode has no runtime views, heartbeat, independent polling or autoselection. The parent drives re-resolution, owns download controls and checks source/origin/generation on replies. The trusted iframe keeps `allow-scripts allow-same-origin allow-forms`; generated HTML/SVG/XML remains outside this mode. Current-generation rendering alone reports loading/ready/error/missing/unsupported. Teardown invalidates pending results and releases owned effects.

User-approved DOMPurify3.4.16 is vendored locally with license and verified registry integrity. DOCX and SheetJS converted HTML share one sanitization boundary in standalone and embedded modes. The allowed content subset preserves text, tables, formatting and inline raster images while excluding executable markup, document styling, event attributes, unsafe schemes and remote image sources. Safe HTTP(S) links use opener/referrer isolation. Mammoth document-supplied style maps are disabled. PPTX remains canvas-based.

Since issue689 the same frame previews text and media for WebUI's sidebar, under the unchanged sandbox and message checks. Embedded Markdown is static: no Mermaid or KaTeX, images only from inline raster data or the chat's files path (no query, no archive route, at most 100), and only same-document fragment links stay active, because the frame shares WebUI's origin and has no CSP. Embedded Markdown, CSV/TSV and code have parse-time size limits, failed loads and undecodable media report error, and embedded audio and video offer no download link. The parent routes raster images to an `<img>` and PDF to WebUI's own single-page viewer; neither enters this frame. Its non-Office copy is neutral, and its error, missing and unsupported states show the parent's failure view with download, which is also what a newer WebUI shows against an older OCU.

Office bookmarks decode fragments once and preserve an existing `user-content-` prefix, adding it otherwise. Only targets in the sanitized fragment are accepted; malformed encoding, absent targets and document-global-only targets lose their `href`.

Standalone Markdown uses the same owned DOMPurify loader with an independent per-call policy. Marked output is sanitized into a detached fragment before trusted insertion; active markup, document styling and controls are excluded. Relative resources, HTTP(S) links/images, mailto, raster data images and namespaced heading fragments remain usable. Highlight, Mermaid and KaTeX process only sanitized content. Sanitizer failure shows a load error without document content, and retired selections cannot attach pending output. Office and Drawio retain their separate policies and sanitizer ownership in either load order.

## Alternatives considered

- **Copy Office rendering into WebUI** — duplicates format handling and failure semantics.
- **Trust MIME or sanitize messages only** — protects selection, not script-bearing document conversion.
- **Block only javascript hyperlinks** — fixes one payload instead of the untrusted HTML boundary.
- **Insert Markdown and remove unsafe nodes afterward** — allows executable content to cross the trusted DOM boundary before cleanup.
- **Allow iframe downloads or scripts in generated content** — widens the fixed sandbox contract; WebUI owns download links.
- **Accept a partial listing as missing** — clears preferences for files beyond the current page.
- **Render PDF in this frame** — the frame is limited to escaped or sanitized text; WebUI's pdf.js viewer already renders PDF in the parent.
- **Keep diagrams, math and remote images in embedded Markdown** — they write after sanitizing or leave the workspace from the employee's browser on a frame without CSP; the standalone page keeps them.

## Consequences

Content-preview fidelity is intentionally narrower than Office layout fidelity. Raw BIFF2/3/4, CFB and OOXML remain accepted by the shared spreadsheet parser after format checks. Browser evidence uses real SPA/renderers and fixed sandbox; synthetic converted-markup resource tests are not full DOCX remote-image conversion proof. WebUI issue29 consumes the interface; issue36 verifies the deployed image. Embedded Markdown is static rather than refused; HTML, SVG, XML, `+xml`, Drawio, PDF, image and other types remain unsupported in Files-only embedding without fetching their content.
