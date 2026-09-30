## ADDED Requirements

### Requirement: Verified local Drawio materials

Build preparation SHALL materialize a fixed, provenance-recorded Draw.io viewer and its required runtime resources with content integrity checks and retained licenses. Deployment/runtime SHALL require no viewer-owned WAN resource or CDN fallback. Preparation SHALL reject unsafe archive members, inconsistent materials and concurrent publication without replacing a valid bundle with partial output.

#### Scenario: Repeatable material preparation

- **WHEN** preparation runs twice from the same pinned upstream inputs
- **THEN** the complete output inventory has identical content hashes and includes the licenses for shipped materials

#### Scenario: Rejected material publication

- **WHEN** source integrity, archive path safety, material completeness or publication fails
- **THEN** preparation exits nonzero and preserves the prior valid bundle or an explicitly identified recovery copy if the filesystem itself refuses restoration
- **AND** a competing publisher cannot overwrite another publisher's committed output

### Requirement: Offline standalone Drawio preview

The standalone preview SHALL render Draw.io files using the real local viewer through the configured public prefix. Supported viewer-owned lazy resources SHALL resolve locally. Failed document fetches, missing/corrupt required assets and render failures SHALL produce a visible failure instead of a blank successful preview. Arbitrary document-authored remote resources are outside offline material coverage; they SHALL NOT be confused with missing viewer-owned resources.

#### Scenario: Local rendering across prefixes and repeated selection

- **WHEN** a diagram containing ordinary shapes and representative lazy stencil, image and mathematical content is selected with WAN denied under empty, `/ocu` and `/tools/ocu` prefixes, then another diagram is selected
- **THEN** expected labels and geometry render using local resources, with no viewer-owned external request and no stale diagram replacing the current selection

#### Scenario: Missing or corrupt renderer

- **WHEN** required local viewer materials are missing or replaced by a loadable invalid script, or a document fetch/render fails
- **THEN** the selected preview visibly fails and cannot be accepted as a successful empty diagram

### Requirement: Drawio preserves adjacent preview trust

Local Draw.io rendering SHALL preserve Office sanitizer protection and existing HTML/SVG/Browser/Terminal policies. Files embedding SHALL retain its unsupported disposition for Draw.io without fetching the diagram or viewer. Loading a viewer SHALL NOT silently replace the approved Office sanitizer contract or leak hooks between renderers.

#### Scenario: Office and Drawio ordering

- **WHEN** real Office content, a Draw.io diagram, and malicious Office content are selected in sequence, including delayed overlapping completion
- **THEN** the diagram renders and Office content retains its approved visible content and non-executable sanitizer behavior

#### Scenario: Embedded Drawio remains unsupported

- **WHEN** the Files-only parent selects a Draw.io identity
- **THEN** the child reports unsupported with zero diagram/viewer requests and no widened iframe permissions
