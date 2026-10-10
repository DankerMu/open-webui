# Design

## Context

The Markdown renderer interpolates marked output into its owned preview stage. Office and Drawio share an explicit sanitizer-loading gate but require different policies. See proposal.md for the approved scope.

## Decisions

- Sanitize marked output into a detached fragment before attaching it to the trusted stage; never insert raw markup and remove it later.
- Reuse pinned DOMPurify 3.4.16 and the existing loader/instance ownership. Supply Markdown options per call, with no persistent configuration or leaked hooks. Do not reuse the Office content policy.
- Allow basic text formatting, headings, lists, tables, pre/code, details/summary, anchors and images. Preserve code-language classes and usable heading fragments without allowing document-controlled names to clobber application globals.
- Allow links to relative files, fragments, HTTP/HTTPS and mailto; allow images to relative files, HTTP/HTTPS and base64 raster data images (PNG/JPEG/GIF/WebP). Reject dangerous or unknown schemes before relative rewriting can disguise them as file paths.
- Preserve file-relative resolution and existing link interception. Mailto must not be rewritten as a workspace filename. Handle malformed fragments without an unhandled event error.
- Run existing highlight, Mermaid and KaTeX processing only on sanitized content. Their generated output is distinct from raw document-supplied SVG/MathML.
- Missing or unusable sanitizer produces the existing visible load failure and no document content, not a raw fallback.

## Invariants and preservation

Governing invariant: untrusted Markdown cannot introduce active markup into the trusted preview DOM, even transiently.
Sibling surfaces: Markdown token URL rewriting, raw HTML, click handling, post-processing, shared Office sanitizer loading, Drawio global ownership, and asynchronous owned-stage retirement.
Must preserve: standalone safe HTML/Markdown and resources; Office sanitization; Drawio rendering in either load order; Office-only Files embedding; empty, /ocu and /tools/ocu prefixes; newest-selection ownership.
Seams under test: production preview response plus real local assets and actual Chromium DOM, clicks, image decoding and render output through the existing browser harness.

## Evidence and risks

- Event/script canaries and a trusted insertion observer distinguish pre-insertion sanitization from late cleanup; baseline must reject the vulnerable renderer semantically.
- Safe HTML, headings/fragments, relative links/images, HTTP/HTTPS/mailto, raster data, highlighted code, Mermaid and KaTeX must render or navigate through their actual consumer path.
- Missing/invalid sanitizer, prohibited tags/attributes/schemes and stale completion must fail safely; only explicitly correlated injected errors are expected.
- Alternate Markdown/Office/Drawio selections and delayed sanitizer load prove policy isolation and stage ownership. Embedded Markdown remains unsupported without fetching its content.
- Native macOS Chromium evidence is not Linux image or LAN deployment certification. Existing installed browser tools may be used without changing repository dependencies; record their actual versions.

## Migration and non-goals

Atomic renderer replacement, no API/schema migration. Rollback is a reviewed revert; it restores the known unsafe Markdown behavior and is not a security mitigation.
No dependency upgrade, generalized DOM-sink audit, Office policy redesign, embedded Markdown support or change to the existing Markdown size limit.
