## MODIFIED Requirements

### Requirement: Workspace display kinds use broker type and MIME

The pure classifier SHALL return one of `web`, `image`, `document`, `sheet`, `slides`, `code` or `other`, from case-insensitive broker `type` and the media type portion of `mime`. HTML/SVG/XML SHALL be web; image formats image; DOCX/PDF/text/Markdown document; XLSX/CSV/TSV and the broker `spreadsheet` type sheet; PPTX slides; JSON/scripts/source files code. A recognized MIME SHALL take precedence over broker type; unrecognized MIME SHALL fall back to a recognized type. Unknown or empty classification inputs SHALL yield other when neither field is recognized. Display classification SHALL NOT change preview or editing eligibility and SHALL NOT infer a different identity from filenames.

#### Scenario: Kinds and media-type normalization

- **WHEN** representative files for all seven kinds include uppercase type/MIME values, `text/html; charset=utf-8`, and unknown/empty values
- **THEN** each known file yields its specified kind regardless of case or MIME parameters, and unknown/empty inputs yield other

#### Scenario: Broker TSV metadata and independent fallbacks

- **WHEN** a file has type `spreadsheet` and MIME `text/tab-separated-values`, only that MIME is recognized, or only that type is recognized
- **THEN** its display kind is `sheet` in each case without relying on its filename
- **AND** a conflicting recognized MIME retains precedence over `spreadsheet`, including a recognized image MIME
- **AND** CSV/XLSX remain `sheet` and unrelated unknown type/MIME pairs remain `other`

#### Scenario: TSV icons do not grant Office capabilities

- **WHEN** the mounted Files panel displays and selects a broker TSV classified as `sheet`
- **THEN** its list and selected-file icons use the sheet kind while identity and download target remain unchanged
- **AND** the display mapping alone grants no Office preview or edit action
