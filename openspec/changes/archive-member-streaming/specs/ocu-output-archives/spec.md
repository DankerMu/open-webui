## ADDED Requirements

### Requirement: Bounded archive source-member buffering

Archive construction SHALL transfer each securely acquired source member with bounded uncompressed-payload buffering independent of that member's size, rather than accumulate a complete source member before writing it. Visible members SHALL retain their relative names and exact decoded bytes, including consecutive multi-chunk and empty members. Existing confinement, hidden filtering, authorization, response and error contracts SHALL remain unchanged. The compressed ZIP SHALL still be completed in memory before response publication; this requirement does not impose a total-archive memory bound or capacity policy.

#### Scenario: Multi-chunk and consecutive members

- **WHEN** an authorized archive request includes visible multi-chunk files followed by another member and an empty file
- **THEN** source bytes are incrementally transferred without member-sized staging
- **AND** decoding the ZIP yields every expected relative name and exact payload, including the empty entry

#### Scenario: Source path changes after acquisition

- **WHEN** a selected path is replaced after its regular file has been securely opened
- **THEN** the transfer continues from that acquired file rather than reopening the replacement path
- **AND** same-inode concurrent edits remain outside snapshot guarantees

#### Scenario: Transfer or archive-member failure

- **WHEN** source reading or ZIP member creation, writing or completion fails
- **THEN** the request does not return a successful partial archive
- **AND** owned source resources are retired through the existing cleanup policy without introducing retries or a new successful fallback

#### Scenario: Unknown or growing member size

- **WHEN** a source member is large or grows across a ZIP size boundary while being read
- **THEN** the transfer reads to EOF and uses a format capable of representing the observed bytes rather than introducing a new member-size rejection
- **AND** the archive remains readable with the expected names and decoded payloads

#### Scenario: Other readers and total archive memory

- **WHEN** MCP reads a workspace file or incompressible members expand the compressed ZIP buffer
- **THEN** the MCP bytes/MIME contract and pre-existing in-memory ZIP behavior remain intact
- **AND** member-buffer improvements do not claim a bound on total archive memory, new capacity limits or whole-response streaming
