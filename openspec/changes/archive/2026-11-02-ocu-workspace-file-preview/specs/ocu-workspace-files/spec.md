## ADDED Requirements

### Requirement: Common workspace files preview in the sidebar

A servable selected file SHALL display in the sidebar according to its MIME essence and broker type, never its display kind or filename. PNG, JPEG, GIF, WebP and BMP SHALL display in an image element loading the canonical current-chat revision URL. PDF SHALL display one page at a time in WebUI's PDF viewer loading the same URL. Broker types markdown, code, text, spreadsheet, audio and video with a MIME not refused by the embedded preview SHALL display through the Files-only preview frame, with the same fixed sandbox and parent validation as Office. Office and generated routing SHALL take precedence and remain unchanged. Any other file SHALL show the download fallback. A file marked too_large or unsupported_name SHALL show the download fallback without loading its bytes. A failed load SHALL leave a visible failure, distinct from an unsupported file, and a working parent download; so SHALL an `unsupported` or `missing` frame state for such a file. A revision change SHALL reload the display, and a change to another file SHALL NOT. Office editing SHALL stay limited to Office types.

#### Scenario: Image and PDF

- **WHEN** PNG, JPEG and PDF files are selected
- **THEN** each displays in the sidebar from its revision URL, with no embedded frame

#### Scenario: Text and media

- **WHEN** Markdown, plain text, CSV, JSON, source code, audio and video files are selected
- **THEN** each displays in the Files-only frame with the fixed sandbox, and Office editing is not offered

#### Scenario: Isolation is unchanged

- **WHEN** an SVG, HTML or XML file is selected, including XML with broker type code, or a file with another `+xml` MIME type
- **THEN** generated content stays in the opaque iframe, and the `+xml` file shows the download fallback

#### Scenario: Over the limit

- **WHEN** a PNG, PDF or text file is marked too_large or unsupported_name
- **THEN** the download fallback shows and no file bytes are requested

#### Scenario: Unreadable file

- **WHEN** an image or PDF fails to load, or the frame reports error, unsupported or missing for a text file
- **THEN** a visible failure and the download remain available

#### Scenario: Switching files

- **WHEN** selection moves across Office, text, image and PDF files
- **THEN** only the newest selection controls the display and no earlier timer or result changes it
