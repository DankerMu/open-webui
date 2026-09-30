# Design

## Context

- OCU `preview.js:712-736` has the external Draw.io loader; `moduleAssetUrl` owns public-prefix asset resolution.
- Existing Files embedding accepts only Office and explicitly rejects Draw.io without fetching its content. That contract is unchanged.
- Fixed upstream release: jgraph/drawio v31.5.3, commit `0f419a92c769adb5fb20f2b18053a5ae8c7e4993`; viewer SHA256 `41f8360963bb485db74517ae7ca8ca01e563b587607a82238f901750b14e26d0`.
- Source archive `https://codeload.github.com/jgraph/drawio/tar.gz/0f419a92c769adb5fb20f2b18053a5ae8c7e4993`, SHA256 `42a3f9b9cbf2ae1a95f1c4a642996e2d96ee689e54a0e77430bae69975d09487`.

## Goals / Non-Goals

- Governing invariant: viewer-owned resources required to render supported Draw.io content are verified local materials, never runtime CDN fallbacks.
- Preserve real standalone rendering, repeat selection, public prefixes, adjacent sanitization, generated-document isolation and existing embedded unsupported state.
- Non-goals: enabling Draw.io in trusted Files embedding, implementing a diagram editor/export service, fetching arbitrary document-authored remote images/fonts, dependency upgrades, deployment/engine/firewall actions. External document resources cannot be made available offline by vendoring the viewer.

## Decisions

- Use one preparation implementation under the OCU server build context; run it before native development verification and from the image build. Generated materials are gitignored. No runtime download and no unbounded latest lookup.
- Derive a fixed path/hash inventory from the pinned archive, including viewer, shapes, stencils, viewer image/style/math resources and their licenses. Prefer complete upstream resource directories over cherry-picking assets that only satisfy one fixture. Exclude unrelated editor/application source.
- Reject unsafe paths, links/special members, unexpected inventory, corrupt archive/material bytes and incomplete publication. Stage separately, serialize publishers, publish only a complete verified inventory; failed prepublication leaves prior valid materials intact. Postcommit cleanup cannot roll back valid output to partially deleted bytes.
- Configure upstream resource bases before loading through the existing module URL seam. Keep upstream bytes unmodified. Inspect actual lazy loading and verify representative stencil/shape/math/image content, not only a rectangle.
- Use the viewer's explicit instance API for the selected render rather than rescanning every stale container. Renderer failures must reach the existing visible failure/download state; valid empty diagrams are not rejected merely for lacking shapes.
- The bundle installs DOMPurify3.4.16 and hooks. Preserve the approved Office sanitizer and its hooks without weakening the viewer's own sanitization. Qualify Office→Draw.io→Office ordering and concurrent late loads; do not introduce a new iframe trust model without a scope decision.

## Risks / Trade-offs

- Archive/closure size → online preparation is explicit and pinned; no raw large-file gate exemption.
- Viewer swallows errors → test missing assets, loadable invalid script, malformed document and lazy-resource failure as observable failures, not blank success.
- Global sanitizer interference → real malicious DOCX before/after Draw.io and actual graph content checks.
- Prefix omissions → exercise empty, `/ocu` and `/tools/ocu`, with all nonlocal requests denied and observed.
- Candidate-controlled test claims → parent owns baseline/mutants and final native acceptance; reviewers do not run validation.

## Migration Plan

Prepare assets, qualify native behavior, merge OCU source and advance the exact WebUI OCU pin. Roll back source/pin and regenerate the prior material inventory together. Actual image/offline restart acceptance remains final #36, not claimed by this prerequisite.
