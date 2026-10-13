# Design

## Context

`OfficeStore` owns both specialized seeds, version metadata and served workspace bytes. Ordinary DOCX seeds read the configured file; unpublished/stale seeds use the 27-byte placeholder. The browser harness already builds a small valid document; the regression harness's separately configured file is only a synthetic ZIP signature.

## Goals / Non-Goals

The governing invariant is that configured scenario workspace/autosave bytes remain renderable and distinct, while every public version, listing and transition still refers to the exact bytes and identity it describes. No production renderer/editor behavior changes, no real DocumentServer claim, no new environment toggle, no checked-in binary fixture family, and no change to unconfigured or intentionally corrupt scenarios.

## Decisions

1. Fix the shared seed owner, not the frontend or screenshot timing alone. Read the configured workspace bytes unchanged and construct the autosave as a valid DOCX package with a deterministic visible content change. Preserve unrelated package parts and XML structure; do not substitute a generic document for the configured input or rely on appended non-package garbage.
2. Keep missing-input route-only payloads exactly as specified by the existing seeds, including their different suffixes. Configured valid input selects the renderable path; invalid configured input is not silently replaced by a fake successful document.
3. Reuse the existing valid-DOCX generator rather than maintaining a second package builder. If smoke setup must share it, move it into the existing fixture-owner module and migrate the browser caller atomically. Generate stable package metadata so repeated identical fixture inputs produce identical bytes.
4. Preserve scenario state logic and public schemas. Existing metadata constructors compute hashes/sizes from the chosen bytes. An autosave remains version2, parent1, unpublished; restore appends a published copy, and stale refusal ends only the old session before a successful retry.
5. Extend existing browser walks with a content-ready assertion before prompt screenshots, not a sleep or suppressed preview error. Exercise restored autosave content in a real read-only preview as well as the current workspace content; retain request-order/history assertions.

## Sibling surfaces and required evidence

- HTTP downloads, output listing and version history: valid configured base preserved exactly, workspace/autosave distinct, ZIP/XML readable and content recognizable, all SHA256/size fields recomputed independently.
- Unpublished restore: selected autosave bytes served after restore, old history unchanged, new published version3 and revision advance.
- Stale: first create409/unpublished_version, old session retired, unchanged history, retry201/new session identity; current bytes are not overwritten.
- Unconfigured seeds: baseline equivalence of bytes and lifecycle observations. Ordinary configured DOCX and intentionally corrupt preview remain unaffected.
- Browser: `make verify-ui` exercises the actual mounted gateway/SPA and existing prompt/order cases, captures recognizable workspace/restored content, and rejects unexpected console/page errors. This is deterministic harness evidence, not a real editor/deployment certificate.
- Parent tracer first observes the invalid configured workspace bytes over real HTTP; the unchanged oracle then accepts the candidate. Plausible same-bytes/wrong-metadata controls qualify new content observations without mutating production code.

## Risks / Trade-offs

DOCX ZIP/XML rewriting can lose content or make bytes nondeterministic → preserve package members, use deterministic variant output, parse independently and observe browser rendering. Existing synthetic configured smoke input cannot enter a real package transform → migrate that test input using the single valid generator, without weakening its lifecycle oracles. Browser harness needs local proxy/assets/browser prerequisites → use existing isolated lifecycle and report any missing prerequisite rather than accepting mock-only rendering.

## Migration Plan

Fixture review and strict validation → frozen baseline HTTP tracer → minimal seed fix and paired consumer regression → parent smoke/browser proof → owning docs, scoped gates, three-seat review, exact-head CI, merge/archive. Revert the bounded fixture change to roll back; no data/schema migration or new service.
