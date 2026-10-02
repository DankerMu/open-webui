# Spec Delta

## ADDED Requirements

### Requirement: File responses are never stored by caches

Every successful response from `GET /files/{chat_id}/{path}`, whether served inline or forced to download with `download=1`, SHALL carry exactly one `Cache-Control` header with the value `no-store`, so that a preview or download requested after a workspace file was replaced cannot be answered from a browser or intermediary cache keyed on modification time and size. The response SHALL be produced from the file's current bytes on every request. File bytes, Content-Type, Content-Disposition and the generated-content isolation headers (`Content-Security-Policy: sandbox allow-scripts allow-forms` and `X-Content-Type-Options: nosniff` on the five active MIME types) SHALL remain exactly as specified by the existing requirement. The archive download `GET /files/{chat_id}/archive` is served by a separate handler and is not changed by this requirement; denied and not-found responses are not changed either.

#### Scenario: Inline file response

- **WHEN** an authenticated caller reads a DOCX, PNG or plain-text file without forcing download
- **THEN** the response carries `Cache-Control: no-store` exactly once and returns the original bytes with the existing Content-Type

#### Scenario: Active content keeps isolation headers

- **WHEN** an authenticated caller reads an HTML or SVG file without forcing download
- **THEN** the response carries `Cache-Control: no-store` together with exactly the fixed sandbox Content-Security-Policy and `nosniff`

#### Scenario: Forced download

- **WHEN** an authenticated caller requests a file with `download=1`
- **THEN** the response carries `Cache-Control: no-store`, Content-Disposition remains attachment, and no isolation header is added

#### Scenario: Replaced file with unchanged size and mtime

- **WHEN** a file is read, its content is then replaced by different bytes of the same size with the original modification time restored, and it is read again
- **THEN** the second response is a full 200 response with the new bytes and `Cache-Control: no-store`

#### Scenario: Archive and error responses

- **WHEN** a caller requests `GET /files/{chat_id}/archive`, or a file request is denied or the file is missing
- **THEN** the status, body and headers of that response are the same as before this change
