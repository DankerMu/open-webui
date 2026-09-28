---
id: 2026-09-27-ocu-restricted-office-embedding
title: Parent-controlled Office embedding with sanitized converted content
kind: architecture
status: implemented
date: 2026-09-27
supersedes: none
references: 2026-09-23-ocu-preview-lifecycle, 2026-09-27-ocu-selected-runtime-embedding, issue-84, issue-29, issue-85
---

# Parent-controlled Office embedding with sanitized converted content

## Problem

WebUI owns selected file identity and preferences, while OCU owns Office rendering. Embedding the standalone SPA does not expose selection or reliable render outcomes. Duplicating the renderers creates a second implementation. Converted Office HTML is untrusted: a real DOCX hyperlink can carry executable script despite a valid broker identity and MIME.

## Decision

The existing authenticated preview route offers explicit `?embed=files` mode. It accepts only exact same-origin parent messages bound to the shell chat and increasing generation. Requests carry file_id, never URLs or bytes. The SPA resolves authorized broker metadata through coherent pagination, bounded to100 pages and10 seconds; incomplete/error enumeration is not deletion. Only DOCX/XLSX/PPTX broker types with permitted MIME reach shared renderers. Canonical same-chat URLs follow the broker's path encoding.

Files-only embedded mode has no runtime views, heartbeat, independent polling or autoselection. The parent drives re-resolution, owns download controls and checks source/origin/generation on replies. The trusted iframe keeps `allow-scripts allow-same-origin allow-forms`; generated HTML/SVG/XML remains outside this mode. Current-generation rendering alone reports loading/ready/error/missing/unsupported. Teardown invalidates pending results and releases owned effects.

User-approved DOMPurify3.4.16 is vendored locally with license and verified registry integrity. DOCX and SheetJS converted HTML share one sanitization boundary in standalone and embedded modes. The allowed content subset preserves text, tables, formatting and inline raster images while excluding executable markup, document styling, event attributes, unsafe schemes and remote image sources. Safe HTTP(S) links use opener/referrer isolation; bookmarks use namespaced IDs. Mammoth document-supplied style maps are disabled. PPTX remains canvas-based.

## Alternatives considered

- **Copy Office rendering into WebUI** — duplicates format handling and failure semantics.
- **Trust MIME or sanitize messages only** — protects selection, not script-bearing document conversion.
- **Block only javascript hyperlinks** — fixes one payload instead of the untrusted HTML boundary.
- **Allow iframe downloads or scripts in generated content** — widens the fixed sandbox contract; WebUI owns download links.
- **Accept a partial listing as missing** — clears preferences for files beyond the current page.

## Consequences

Content-preview fidelity is intentionally narrower than Office layout fidelity. Raw BIFF2/3/4, CFB and OOXML remain accepted by the shared spreadsheet parser after format checks. Browser evidence uses real SPA/renderers and fixed sandbox; synthetic converted-markup resource tests are not full DOCX remote-image conversion proof. WebUI issue29 consumes the interface; issue36 verifies the deployed image. Standalone Markdown raw-HTML handling is separately tracked in issue85 and is not admitted by Office-only embedding.
