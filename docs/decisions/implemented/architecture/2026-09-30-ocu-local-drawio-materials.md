---
id: 2026-09-30-ocu-local-drawio-materials
title: Build-prepared Drawio materials with renderer-owned failure boundaries
kind: architecture
status: implemented
date: 2026-09-30
supersedes: none
references: 2026-09-27-ocu-restricted-office-embedding, issue-97, issue-33, issue-36, issue-99
---

# Build-prepared Drawio materials with renderer-owned failure boundaries

## Problem

The standalone diagram viewer depends on an external script and lazy resources. Pinning only its script does not supply stencil, image or mathematical content offline. The viewer also installs globals used by Office rendering and can replace missing stencil geometry with a generic shape without throwing.

## Decision

Prepare the fixed upstream release before native verification and image construction, using the server's Python runtime. Verify the source archive and explicit resource inventory, retain root and component licenses, and publish only a complete staged bundle under an exclusive publication lock. Generated materials stay outside Git. Deployment and runtime use local assets; offline source rebuilding is not required.

Asset URLs derive from the preview module's public prefix. The real upstream viewer remains unmodified. Renderer checks follow its custom-shape and stencil resolution semantics for the current page. Missing required resources produce visible failure; retry invalidates only failed resource and dependent logical-library cache entries. Local page and zoom interactions remain available.

Each body-owned fullscreen UI belongs to its preview's child lifetime. Close controls, Escape, render failure and stage retirement share one idempotent close handle. Guard retirement is immediate; upstream destruction waits for the pinned viewer's deferred body attachment to settle. Cleanup removes only the owning UI and preserves the original scrolling and resize-sensor state across overlapping fullscreen lifetimes, so an older pending close cannot disturb a newer modal.

Office owns its approved sanitizer instance independently of the viewer's sanitizer and hooks. Script loading across these owners is serialized. Files embedding retains its Office-only contract: Drawio remains unsupported without diagram or viewer fetch. Generated-document iframe and response policies are unchanged.

The WebUI native verification stage must prepare the pinned materials inside the reconstructed served tree; preparing a separate sibling checkout does not populate that tree.

## Alternatives considered

- **Disable diagram preview** — violates the requested functionality-preserving offline boundary.
- **Commit the complete upstream resource tree** — adds large third-party files and requires broad large-file gate exceptions; explicit build preparation supplies the same runtime bytes.
- **Vendor only the main script** — leaves content-dependent lazy CDN requests.
- **Add Node to the Python image for preparation** — introduces an unnecessary runtime and architecture-specific distribution dependency.
- **Accept any SVG as successful rendering** — admits generic fallback geometry after required resources fail.
- **Relocate fullscreen into a stage-owned modal root** — changes upstream placement and introduces clipping and stacking-context risks; lifetime-owned closure preserves the pinned viewer.

## Consequences

Online preparation requires the pinned archive or a verified cache. A process killed without cleanup can leave a publication lock or recovery directory; operators must establish that its owner is dead before manual recovery. Ordinary exceptions and catchable interruption preserve the previous bundle. No automatic stale-lock takeover is assumed.

Component icon/stencil notices include additional redistribution restrictions and remain authoritative. Arbitrary document-authored remote fonts/images are outside the offline material guarantee. Native browser and publication evidence establish source acceptance; deployed image and offline restart acceptance remain separate.

The mounted-SPA browser harness covers explicit selection, listing-driven new-file selection, same-identity rename, revision refresh, removal/fallback and empty listings. Close-button, Escape, repeated retirement and controlled deferred-attachment cases check owned-node removal, scrolling restoration and newer-viewer usability. DOM activation of the mounted selector exercises its real event path without claiming pointer access through the fullscreen backdrop; stacking and embedded-mode policies remain unchanged.
