## ADDED Requirements

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
