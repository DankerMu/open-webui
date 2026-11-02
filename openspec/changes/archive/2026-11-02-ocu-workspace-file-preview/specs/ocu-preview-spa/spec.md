## MODIFIED Requirements

### Requirement: Honest generation-aware embedded rendering

The Files-only embedded view SHALL reuse the existing renderers and report loading, ready, error, missing or unsupported for the current selection. It SHALL support only broker types docx, xlsx, pptx, markdown, code, text, spreadsheet, audio and video, SHALL refuse a file marked too_large or unsupported_name, and SHALL additionally refuse MIME essence text/html, image/svg+xml, application/xhtml+xml, application/xml, text/xml or any +xml suffix regardless of type. It SHALL report ready only after successful rendering; corrupt Office content, and a failed load of text, Markdown or spreadsheet content, SHALL produce error and a visible failure indication so the parent can offer its own authorized download. Audio and video SHALL report ready on the element's loadedmetadata event and error on its error event. Embedded audio and video SHALL offer no download link. File names and contents SHALL reach the trusted DOM only escaped or sanitized, no renderer SHALL place an unvalidated file extension in markup, and the shared escaping helper SHALL be safe in attribute values. PDF SHALL NOT be rendered in this view. The fixed trusted iframe sandbox SHALL not be widened to enable downloads. A superseded request SHALL not overwrite the display or emit a current result.

#### Scenario: Real Office and stale completion

- **WHEN** a valid Office file is selected, a corrupt Office file is selected, and a delayed old render resolves after a newer selection
- **THEN** valid content is visible with ready, corrupt content has error for the parent's download fallback, and only the newest selection controls the display and result

#### Scenario: Generated document refusal

- **WHEN** broker metadata has an unsupported type or forbidden MIME, including svg-as-image, xhtml-as-other, xml-as-code, drawio, html, pdf, image and other
- **THEN** Files embedding reports unsupported without invoking a trusted DOM renderer or reading user sandbox settings

#### Scenario: Text and media rendering

- **WHEN** valid Markdown, plain text, CSV, JSON, source code, audio and video files are selected
- **THEN** each is visible with ready, and audio and video have no download link

#### Scenario: Undecodable media

- **WHEN** a selected audio or video file is corrupt or in a format the browser cannot decode
- **THEN** the view reports error and the parent offers its download

#### Scenario: Text load failure

- **WHEN** fetching a selected Markdown, code or CSV file fails or returns a non-OK status
- **THEN** the view shows a failure and reports error

#### Scenario: Hostile name and content

- **WHEN** a file name's extension carries markup, or Markdown carries scripts, event handlers or script links
- **THEN** no script runs in embedded or standalone mode, no injected element appears, and links neither navigate the frame nor select a file

### Requirement: Standalone Markdown is sanitized before trusted insertion

Markdown SHALL retain safe HTML while removing executable document content before it enters the trusted preview DOM. Script, event attributes, forms and controls, iframe/object/embed, raw SVG/MathML, style/link/meta/base, inline styles and unsafe URL schemes SHALL be excluded. Sanitizer failure SHALL produce a visible load failure without inserting raw content, and SHALL report error in embedded mode. Basic formatting, headings, lists, tables, pre/code, details/summary and anchors SHALL remain usable, including language classes and heading-fragment navigation.

Links SHALL permit relative files, fragments, HTTP/HTTPS and mailto. Images SHALL permit relative files, HTTP/HTTPS and inline PNG/JPEG/GIF/WebP raster data only. URL handling SHALL preserve existing relative file resolution and link interception without treating mailto as a file or converting forbidden schemes into usable file links. Document identifiers SHALL NOT clobber application globals. Embedded Markdown over 30,000 characters SHALL display as escaped plain text with a notice, stopping at 200,000 characters, embedded code or text over 20,000 characters SHALL display without highlighting, an embedded spreadsheet SHALL display at most 200 columns with a notice and at most 1,000 characters per cell, and embedded Markdown whose upper bound on table cells, taken from the text before parsing, exceeds 200,000, or with a line holding more than 16 `>` characters, SHALL use the plain-text view. Embedded Markdown SHALL be static: it SHALL run no diagram or math renderer, SHALL remove before insertion every image that is neither inline raster data nor a URL whose resolved origin equals the page origin and whose path is under the chat's files path, and every image with a query string, resolving to the chat's archive route, malformed, or past the first 100, and SHALL keep only same-document fragment links active, with every other link left as text. Standalone behaviour SHALL remain as described.

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

#### Scenario: Large embedded text

- **WHEN** a Markdown file over 30,000 characters or with a table-cell bound over 200,000, a code file over 20,000 characters, or a spreadsheet row with more than 200 columns or a cell over 1,000 characters is selected, whatever its shape
- **THEN** it reports ready promptly, as plain text, without highlighting, or showing at most 200 columns and 1,000 characters per cell

#### Scenario: Embedded Markdown is static

- **WHEN** an embedded Markdown file contains Mermaid, math, remote, root-absolute, `../`-traversing and `//host` images, and HTTP, mailto, relative and fragment links
- **THEN** no diagram or math renderer runs, every image request stays on the page origin under the chat's files path, only the fragment link is active, and the content is visible with ready
