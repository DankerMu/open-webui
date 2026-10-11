## ADDED Requirements

### Requirement: Upload smoke distinguishes complete and partial listings

The stub smoke SHALL compose uploads with the existing 101-entry `large` and `partial_after` fixtures. It SHALL preserve their ordering and intentional failure behavior, verifying file-byte retrieval independently of successful listing visibility.

#### Scenario: Uploaded file appears only on the successful later page

- **WHEN** a unique upload is accepted in the `large` scenario
- **THEN** the first response contains the same 100 fixture paths, no uploaded path and cursor 100
- **AND** the successful cursor-100 response contains the uploaded path exactly once after the remaining fixture path
- **AND** retrieving the uploaded file returns 200 with the exact uploaded bytes

#### Scenario: Accepted bytes remain readable after the intentional listing failure

- **WHEN** a unique upload is accepted in `partial_after`
- **THEN** the first response preserves the 100 fixture paths, excludes the uploaded path and advertises cursor 100
- **AND** cursor 100 returns 503 with `listing_incomplete`, without a successful uploaded-file listing assertion
- **AND** file retrieval after that listing failure returns 200 with the exact uploaded bytes
