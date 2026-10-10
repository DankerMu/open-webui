# ocu-preview-spa Specification

## Purpose

Make the OCU preview SPA usable behind its public prefix with authorized requests, revision-correct refresh and honest Office content previews.

## Requirements

### Requirement: Prefix-safe request and asset ownership

Authored SPA module imports SHALL be relative, and dynamic local script/worker/viewer assets SHALL derive from module URLs without root-absolute /static/ literals. One request wrapper SHALL add X-Requested-With: ocu-workspace to application-owned scripted HTTP requests. Client root paths SHALL receive the configured prefix once with segment-boundary matching; server-emitted API/file/describe URLs SHALL remain verbatim. Terminal and browser WebSockets SHALL use the correct public base and page protocol. No internal token SHALL enter browser config. Explicit Files-only embedding SHALL suppress runtime discovery, heartbeat and runtime clients without changing standalone behavior.

#### Scenario: Request provenance

- **WHEN** prefix is empty, /ocu or /tools/ocu and a client path, already-prefixed path, relative URL or server-emitted URL is requested
- **THEN** routing matches its provenance, headers preserve request data, and no /ocu/ocu path or wrongly prefixed WebUI describe request is emitted
- **AND** /oculus is not mistaken for an /ocu path segment

#### Scenario: Heartbeat and discovery

- **WHEN** the standalone SPA is mounted and its heartbeat/browser discovery runs
- **THEN** HTTP requests carry the workspace header with the correct prefix and only one heartbeat timer exists
- **AND** unmount cleans up that timer

### Requirement: Describe badge and explicit recovery

The badge SHALL consume cli_badge from the exact shell-emitted describeUrl and SHALL never request runtime-cli. Both stopped recovery branches SHALL call the same existing launch alias; polling SHALL not launch a sandbox, and failed launch SHALL not proceed to ttyd start.

#### Scenario: Badge and stopped branches

- **WHEN** describe supplies a badge or either stopped branch is selected
- **THEN** the badge reflects the describe payload and explicit recovery uses restart-container for both branches
- **AND** describe failure hides the badge without a fallback runtime-cli request

### Requirement: Revision-consistent paginated refresh

The SPA SHALL use path plus entry revision rather than mtime to detect changed content, preserve unchanged view state and selected identity across rename, and remove deleted selection. It SHALL expose a more control for further pages and retain the loaded window on refresh. Only a complete same-revision page chain from the latest request generation SHALL replace displayed state. Midchain stale cursor SHALL trigger at most one restart; failed/incomplete chains SHALL preserve prior display with a visible error state.

#### Scenario: Revision versus display mtime

- **WHEN** a selected file changes revision with unchanged mtime, or only its display mtime changes
- **THEN** the revision change reloads the preview while mtime-only changes do not reset it

#### Scenario: Pagination and late responses

- **WHEN** more than100 files exist, more is selected and a later poll overlaps a slower previous request
- **THEN** later-page files remain reachable and the older response cannot overwrite newer state
- **AND** a stale page cannot be combined with a new first page

#### Scenario: Render completion ordering

- **WHEN** an old preview fetch/render completes after a newer selection or revision
- **THEN** it cannot overwrite the currently selected content

### Requirement: Honest Office content rendering

DOCX, XLSX and PPTX views SHALL display 内容预览 with a fidelity disclaimer. XLSX formulas without cached values SHALL be visibly marked uncomputed, while cached zero/false values remain displayed. Sheet/slide navigation and PPTX failure download fallback SHALL remain usable. Observed revision changes SHALL refresh displayed Office content without stale-cache reuse.

#### Scenario: Office refresh evidence

- **WHEN** real DOCX Chinese/title/table, multisheet XLSX and multislide PPTX fixtures are opened and then size-changed
- **THEN** browser screenshots show updated content and the content-preview label, with no new console errors
- **AND** XLSX uncomputed formulas are not blank or falsely presented as calculated values

### Requirement: Restricted parent selection protocol

The existing preview page SHALL offer explicit Files-only embedding using the exact message schemas in this change's design. It SHALL accept only its same-origin parent, matching chat identity and monotonically increasing valid generation. Unknown fields, arbitrary URLs, invalid origins or sources SHALL not cause selection, requests or execution. Embedded mode SHALL publish its ready handshake only after its listener is installed and SHALL target the exact parent origin.

#### Scenario: Parent and child separation

- **WHEN** a valid parent selects a file_id while a sibling, opaque child, wrong-chat sender or malformed message attempts another selection
- **THEN** only the valid parent request is processed and responses carry its chat/file/generation identity

### Requirement: Authoritative bounded file resolution

Selection SHALL resolve file_id against current authorized broker metadata using a coherent paginated listing and bounded page/time work. It SHALL never use parent-supplied paths or URLs. Missing SHALL mean complete coherent enumeration without the identity; network errors, partial pages, stale chains and exceeded limits SHALL produce error instead. Resolved URLs SHALL remain on the same origin and configured chat file path.

#### Scenario: Later page and deletion

- **WHEN** the selected identity exists on a later page, is deleted, and the parent re-requests that file_id with a higher generation
- **THEN** it first renders the correct file and the re-request reports missing only after a complete coherent listing proves absence
- **AND** a failed or truncated listing never reports missing

### Requirement: Honest generation-aware embedded rendering

The Files-only embedded view SHALL reuse existing Office renderers and report loading, ready, error, missing or unsupported for the current selection. It SHALL support only broker types docx/xlsx/pptx and SHALL additionally refuse MIME essence text/html, image/svg+xml, application/xhtml+xml, application/xml, text/xml or any +xml suffix regardless of type. It SHALL report ready only after successful rendering; corrupt Office content SHALL produce error and a visible failure indication so the parent can offer its own authorized download. The fixed trusted iframe sandbox SHALL not be widened to enable downloads. A superseded request SHALL not overwrite the display or emit a current result.

#### Scenario: Real Office and stale completion

- **WHEN** a valid Office file is selected, a corrupt Office file is selected, and a delayed old render resolves after a newer selection
- **THEN** valid content is visible with ready, corrupt content has error for the parent's download fallback, and only the newest selection controls the display and result

#### Scenario: Generated document refusal

- **WHEN** broker metadata has a non-Office type or forbidden MIME, including svg-as-image, xhtml-as-other, xml-as-code and drawio
- **THEN** Files embedding reports unsupported without invoking a trusted DOM renderer or reading user sandbox settings

### Requirement: Read-only embedded lifecycle

Files-only embedded mode SHALL not mount runtime views or perform heartbeat, browser/terminal discovery, CLI badge, launch or ttyd operations. It SHALL have no independent polling, autoselection or child-link selection path; re-resolution requires a newer parent request. All Files embedding listeners, timers and render observers SHALL be released on teardown. Standalone preview behavior SHALL remain compatible.

#### Scenario: Passive preview lifecycle

- **WHEN** a Files-only embedded preview is opened, changed, removed and opened again
- **THEN** only necessary file/listing requests occur, no runtime action occurs and removed instances cannot send results or retain owned effects

### Requirement: Converted Office content is not executable

Document-converted HTML SHALL be sanitized before insertion into the trusted SPA DOM using the locally pinned approved sanitizer. This protection SHALL apply at the canonical renderer boundary in both embedded and standalone modes. Scriptable tags, event attributes, unsafe URL schemes and document-controlled style-map output SHALL not execute or escape the approved content subset. Normal content, tables and supported inline images SHALL remain usable; safe-link behavior SHALL be explicit and unsolicited external-resource requests SHALL be prevented.

#### Scenario: Real malicious DOCX

- **WHEN** a genuine DOCX contains a script-bearing hyperlink or hostile embedded style-map output and is rendered through the bundled converter under the fixed trusted iframe sandbox
- **THEN** activating its content cannot execute frame or parent sentinels or navigate to an executable URL
- **AND** ordinary DOCX text/table/inline-image content and approved safe links remain usable

### Requirement: Selected runtime embedding

The authenticated preview page SHALL support framed `embed=browser` and `embed=terminal` modes that display only the selected existing runtime interface without independent Files listing, nested view tabs or automatic switching to another view. Exactly one recognized embed parameter and a parent frame SHALL be required; invalid or repeated embed values and non-framed embedding SHALL render a visible error without runtime requests. All runtime HTTP and WebSocket requests SHALL remain on the configured public prefix and browser origin. Opening a mode SHALL NOT implicitly launch a stopped sandbox.

#### Scenario: Selected view with no outputs

- **WHEN** a parent opens Browser or Terminal embedding for a running workspace with zero outputs
- **THEN** the selected runtime surface remains usable and its actual client uses only the same-origin prefixed service endpoints
- **AND** no Files listing or unselected runtime client is mounted

#### Scenario: Invalid embedding

- **WHEN** embed is repeated, unknown, or requested without a parent frame
- **THEN** a visible invalid-embedding state appears and no runtime action occurs

#### Scenario: Runtime unavailable

- **WHEN** browser discovery is unavailable, malformed, non-successful or reports inactive
- **THEN** the page presents a distinct non-active status without attempting implicit sandbox launch

### Requirement: Runtime embedding owns resource lifetime

Runtime embedding SHALL own at most one heartbeat timer and SHALL release its polling, pending status work, reconnection timers and WebSockets when removed. Late responses or connection completions SHALL NOT create replacement resources for a retired frame. Standalone runtime and Files-only embedding SHALL preserve their existing behavior.

#### Scenario: Repeated mount and delayed completion

- **WHEN** Browser and Terminal frames are opened and removed20times, including removal during pending status and connection work
- **THEN** each live frame uses only its selected client and every removed frame leaves zero active owned connections and no future polls/reconnects after pending work settles

### Requirement: Runtime shell has a dedicated content policy

Runtime embed HTML SHALL carry a CSP restricting scripts, styles, fonts, images and connections to the approved same-origin assets and explicit inline/data/blob exceptions in the design. Only its nonce-bound configuration script SHALL execute inline; external script/network destinations and nested frames SHALL be denied. The parent iframe policy SHALL remain fixed at allow-scripts allow-same-origin allow-forms, independent of user-generated-content settings. Generated document responses and Files-only rendering SHALL retain their existing isolation rules.

#### Scenario: Allowed runtime and denied external content

- **WHEN** an actual runtime embed loads local modules/styles/fonts, opens its same-origin service WebSocket and attempts an unapproved external script or connection
- **THEN** normal runtime initialization succeeds, the external operation is blocked by CSP and no parent sandbox permission is widened

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

### Requirement: Standalone Markdown is sanitized before trusted insertion

Standalone Markdown SHALL retain safe HTML while removing executable document content before it enters the trusted preview DOM. Script, event attributes, forms and controls, iframe/object/embed, raw SVG/MathML, style/link/meta/base, inline styles and unsafe URL schemes SHALL be excluded. Sanitizer failure SHALL produce a visible load failure without inserting raw content. Basic formatting, headings, lists, tables, pre/code, details/summary and anchors SHALL remain usable, including language classes and heading-fragment navigation.

Links SHALL permit relative files, fragments, HTTP/HTTPS and mailto. Images SHALL permit relative files, HTTP/HTTPS and inline PNG/JPEG/GIF/WebP raster data only. URL handling SHALL preserve existing relative file resolution and link interception without treating mailto as a file or converting forbidden schemes into usable file links. Document identifiers SHALL NOT clobber application globals.

#### Scenario: Hostile raw HTML

- **WHEN** a standalone Markdown file contains script/event canaries, prohibited markup, inline styles and dangerous or obfuscated URL schemes
- **THEN** the canaries do not execute and prohibited content never enters the trusted preview DOM
- **AND** permitted neighboring HTML remains visible rather than being escaped wholesale

#### Scenario: Safe Markdown consumers

- **WHEN** a Markdown document contains headings, lists, tables, folding blocks, links, relative and raster images, fenced language code, Mermaid and mathematical notation
- **THEN** safe content, fragment navigation, file selection, external-link interception, mailto semantics, decoded images, syntax highlighting, diagram geometry and mathematical glyphs remain usable
- **AND** empty, /ocu and /tools/ocu prefixes resolve local resources correctly

#### Scenario: Sanitizer cannot run

- **WHEN** the required local sanitizer cannot load or is unusable
- **THEN** Markdown displays a load failure with no raw document content and no canary execution

#### Scenario: Adjacent renderers and selection ownership

- **WHEN** Markdown, Office and Drawio are selected in either sanitizer/viewer load order, including a superseded pending sanitizer load
- **THEN** each renderer retains its own content policy and only the current selection remains displayed
- **AND** Files-only embedding still refuses Markdown without fetching it or widening its sandbox
