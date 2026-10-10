## Why

The workspace image pins Node22.11.0/npm10.9.0 below its manifest engines. [#196](https://github.com/DankerMu/open-webui/issues/196#issuecomment-6094710549) explicitly authorizes the official linux-x64 Node22.23.2 distribution with bundled npm10.9.8. The historical npm-install timeout has no established causal link to that mismatch.

## What Changes

Change the root Dockerfile's fixed Node tarball version only. Extend the existing image-test entrypoint to verify exact installed versions, engine compatibility and real Mermaid/TypeScript/PDF tool results. Preserve manifest dependency ranges, engine floors, image platform and package layout.

## Capabilities

### Modified Capabilities

- `ocu-offline-image-delivery`: add workspace Node runtime and executable tool acceptance without changing release roles or deployment gates.

### New Capabilities

None.

## Impact

OCU root Dockerfile and existing `tests/test-docker-image.sh`; source changelog and owning image-delivery decision after proof. No business dependency or lockfile change, independent npm installation, floating runtime, weaker engine, source pin or LAN deployment.

## Risk triage

Issue type: bugfix. Fixture level: expanded; upstream suggested level absent. Trigger: image runtime/dependency compatibility. Selected packs: runtime configuration, packaging/dependency compatibility, image-test CLI, artifact/resource ownership and documentation. Evidence floor: full linux/amd64 build, installed exact versions, complete build log without runtime EBADENGINE, actual mmdc render/tsx execution/tsc compilation/pdfjs parsing in that immutable image. Host versions or a partial overlay image cannot satisfy acceptance.
