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

### Requirement: Descriptor-bound single-file responses

Both inline and forced-download responses from `/files/{chat_id}/{filename}` SHALL stream only from one regular-file descriptor securely acquired beneath the requested chat workspace. Pathname replacement SHALL NOT redirect bytes or metadata after acquisition. Content-Length, ETag and Last-Modified SHALL derive from that same opened object. Existing MIME, charset, encoded disposition, selective CSP/nosniff, no-store, authorization and ordinary missing/non-file error semantics SHALL remain intact. No Range capability SHALL be introduced; existing method/range behavior of the pinned framework SHALL be preserved.

#### Scenario: Ancestor replacement before acquisition

- **WHEN** a temporary in-root ancestor is replaced by a symlink to a benign external marker after path validation and before authoritative open
- **THEN** either response mode returns a closed403/404 or bytes from an already-pinned in-root file, never the marker bytes

#### Scenario: Root replacement during acquisition

- **WHEN** the requested chat root or outputs root is renamed and replaced with a symlink to a benign sibling or external tree after route validation and at its acquisition boundary
- **THEN** both response modes return only403/404 or already-pinned original in-root bytes, never redirected marker bytes

#### Scenario: Path replacement after acquisition

- **WHEN** a selected leaf or ancestor is replaced after acquisition and before response body transmission
- **THEN** both response modes retain the original opened object's bytes and metadata headers, not those of the replacement target

#### Scenario: Ordinary and safely resolved in-root paths

- **WHEN** an authenticated caller requests an empty, nested or multi-chunk ordinary file, or an alias resolving to a file inside the same outputs root
- **THEN** bytes, status, MIME, disposition, isolation policy and metadata remain consistent with the opened in-root file for inline and download responses
- **AND** an outside link or pre-existing chat/outputs-root alias cannot cause sibling-chat bytes to be served

#### Scenario: Existing file errors and protocol behavior

- **WHEN** the caller requests a missing file, a directory, an unsupported method or a byte range
- **THEN** existing status/body and method/range semantics remain unchanged without adding range support
- **AND** rejected requests do not add successful isolated-content headers or expose target content

### Requirement: Bounded descriptor response ownership

A file response SHALL use bounded per-read chunks without materializing the complete uncompressed file. Descriptor ownership SHALL begin inside guarded response execution and end on successful completion, disconnect, cancellation or setup/read/send failure. An unexecuted response object SHALL NOT retain a descriptor. Cleanup SHALL NOT close a descriptor still used by an abandoned worker or close a reused descriptor twice. Failures after response headers SHALL abort the stream rather than report a second successful or error response.

#### Scenario: Successful and empty response cleanup

- **WHEN** an empty or multi-chunk response finishes
- **THEN** exact expected bytes and metadata have been sent and the owned descriptor is closed

#### Scenario: Abandoned and failed response cleanup

- **WHEN** the client disconnects or execution is cancelled before the first body or during a read, or setup/read/send raises
- **THEN** the owned descriptor is released after any active read completes, no replacement descriptor is closed, and no path is reopened
- **AND** no descriptor is acquired by constructing a response object that is never executed

### Requirement: Confined ordinary-file GET and HEAD parity

The ordinary-file endpoint SHALL explicitly support GET and HEAD through the same validated descriptor boundary. Reads SHALL remain inside the requested chat's workspace and return only regular-file data, preserving the existing reader's allowed in-root behavior without creating a new visibility/index authorization rule. Private Office/control paths outside that workspace SHALL remain inaccessible. The gateway's grant mapping SHALL never dispatch the archive endpoint as a filename. HEAD SHALL produce GET-equivalent status and file headers without body bytes and SHALL close held resources. MIME, generated-content isolation, attachment, no-store, fresh-read and supported validator semantics SHALL remain intact. Pathname replacement after validation SHALL NOT redirect bytes or metadata to another file. This change SHALL NOT add a new byte-range feature; any retained range behavior SHALL use the same validated descriptor.

#### Scenario: GET and HEAD on the same file

- **WHEN** an authorized caller requests an ordinary generated file, binary file or canonical download using GET and HEAD
- **THEN** the same validated file and relevant metadata/policy are selected, HEAD sends no body, and neither request leaks a descriptor

#### Scenario: Missing or non-ordinary target

- **WHEN** GET or HEAD targets a missing file, directory, non-regular object, outside-workspace symlink target or private state outside the chat workspace
- **THEN** it is refused without returning target bytes or private metadata and without leaking a descriptor

#### Scenario: Concurrent path replacement

- **WHEN** a sandbox replaces a validated path before streaming or HEAD metadata completion
- **THEN** the response uses only its validated descriptor or fails closed; it never reopens the substituted pathname
