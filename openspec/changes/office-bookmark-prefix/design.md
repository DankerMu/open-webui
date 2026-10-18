# Design

## Context

`safeOfficeHtml` sanitizes converter output into a detached fragment before trusted insertion. DOMPurify preserves IDs starting with `user-content-`; the Office resolver unconditionally adds that prefix. The Markdown resolver already uses an idempotent rule. DOCX and XLSX share the Office boundary; embedded and standalone views share their renderers.

## Decision

Decode once, preserve an existing `user-content-` prefix, otherwise prepend it. Keep the lazy set of sanitized fragment IDs, exact membership check, encoded output href and malformed-encoding rejection. This matches the pinned sanitizer without maintaining a second original-to-sanitized-ID map. Do not extract a cross-renderer helper or change Markdown.

## Must preserve

- `SANITIZE_NAMED_PROPS: true`, sanitizer asset/configuration and detached insertion.
- External links, inline versus remote images, unsafe schemes and hostile style-map handling.
- Existing ordinary bookmarks, XLSX consumer behavior, public-prefix handling and Files-only embedding restrictions.
- No document-global target lookup in fragment acceptance, and no new fallback for invalid links.

## Observable evidence

Extend `tests/orchestrator/preview_embedding_browser.cjs` using its existing OOXML DOCX generator and real bundled Mammoth/DOMPurify. First add one already-prefixed bookmark regression and freeze it before repair. The failure must be the missing usable href/navigation, not dependency or browser setup failure.

A link must be visible and its target outside the visible scroll area before clicking; after the actual click, the target's containing content must enter the visible area. Capture screenshots and zero unexpected console/page errors. Cover ordinary and already-prefixed bookmarks through both embedded and standalone rendering without replacing the converter or sanitizer.

After the first GREEN, add encoded ordinary/prefixed fragment cases and malformed, missing and document-global-only target controls at the actual sanitizer boundary. These synthetic boundary checks are not described as real-DOCX evidence. Retain existing external-link/image/style-map checks and execute the complete browser harness plus canonical preview-prefix regressions. Record actual command, browser/version, source hashes and cleanup.

## Ownership and limits

Parent owns the fixture, frozen regression and execution evidence; one implementer edits only source/tests and then existing documentation. Update the owning restricted-Office-embedding decision and OCU changelog after proof. No new architecture record is needed for the local mapping correction.

The invariant is that an accepted Office fragment resolves only to an ID in its sanitized document fragment. Producers: DOCX/XLSX converters; validator/storage: detached sanitized fragment; consumers: both preview modes; failure path: href removal. Review these sibling surfaces without broadening their policies.

Rollback is the focused source/test change; no persistent migration. Local Chromium proof does not certify Office fidelity, other browser engines, real ONLYOFFICE or LAN deployment. Parent evidence custody is not OS-enforced isolation.
