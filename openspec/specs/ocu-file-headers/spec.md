# ocu-file-headers Specification

## Purpose

Mirror generated-content browser isolation at the OCU file endpoint without changing download behavior or unrelated response policies.

## Requirements

### Requirement: Selective generated-content isolation mirror

Successful non-download responses from `/files/{chat_id}/{filename}` with Content-Type text/html, image/svg+xml, application/xhtml+xml, text/xml or application/xml SHALL carry exactly one Content-Security-Policy value `sandbox allow-scripts allow-forms` and X-Content-Type-Options `nosniff`. Charset parameters SHALL NOT prevent matching. No other CSP SHALL coexist on these responses. File bytes and existing MIME behavior SHALL remain unchanged.

#### Scenario: Active generated content

- **WHEN** an authenticated caller reads a file in any of the five MIME types without forcing download
- **THEN** the response carries exactly the fixed sandbox policy and nosniff, without allow-same-origin, and returns the original bytes

#### Scenario: Forced download

- **WHEN** an authenticated caller requests that file with `download=1`
- **THEN** Content-Disposition remains attachment and neither mirror header is added by this change

#### Scenario: Other response surfaces

- **WHEN** the file MIME is plain text, PNG or unknown/octet-stream, or the request is denied or the file is missing
- **THEN** the mirror headers are absent and the existing content or error behavior remains unchanged
