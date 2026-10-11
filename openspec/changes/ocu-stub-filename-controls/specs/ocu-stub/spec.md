## ADDED Requirements

### Requirement: Upload filenames exclude HTTP control characters

The stub SHALL reject upload names containing decoded U+0000–U+001F or U+007F with its existing400 invalid-filename response before storage. Rejection SHALL leave the chat outputs listing unchanged. Supported ordinary names SHALL retain inline and attachment disposition behavior, without raw control characters inside disposition header values.

#### Scenario: Encoded controls never enter upload state

- **WHEN** valid multipart requests use each URL-encoded control in U+0000–U+001F and U+007F, including CR, LF and NUL, in the upload name
- **THEN** each request returns400 and the complete chat outputs listing remains unchanged
- **AND** GET of the rejected path in inline and `download=1` modes returns404 without a disposition header or malformed/injected header lines

#### Scenario: Ordinary uploaded file preserves both disposition modes

- **WHEN** a supported ordinary filename is uploaded and retrieved with and without `download=1`
- **THEN** both GETs return200 and the exact uploaded bytes
- **AND** each raw response has exactly one correctly framed disposition field with the basename, inline without the flag and attachment with the flag

#### Scenario: Existing traversal rejection remains unchanged

- **WHEN** a matched upload route decodes its filename to a leading slash or a path with an empty, dot or dot-dot component
- **THEN** the stub retains400 rejection without storing the upload
