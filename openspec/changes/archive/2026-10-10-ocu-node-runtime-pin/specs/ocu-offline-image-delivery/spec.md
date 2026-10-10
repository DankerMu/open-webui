## ADDED Requirements

### Requirement: Approved workspace Node runtime

The linux/amd64 workspace image SHALL use the official fixed linux-x64 Node.js22.23.2 distribution and its bundled npm10.9.8. Existing node>=22.20.0 and npm>=10.9.3 engine floors and declared business dependency ranges SHALL remain unchanged. Acceptance SHALL require a complete image build with no runtime-incompatibility EBADENGINE diagnostics and observed installed versions from that image; host output or a partial image SHALL NOT substitute for this evidence.

#### Scenario: Runtime and dependency compatibility

- **WHEN** the complete candidate workspace image is built and inspected
- **THEN** its platform is linux/amd64 and its installed runtime reports Node22.23.2/npm10.9.8 satisfying unchanged engine declarations
- **AND** the complete dependency-install log contains no runtime-incompatibility EBADENGINE warning or error

#### Scenario: Incomplete build or unsupported runtime

- **WHEN** the full build fails, the installed runtime differs, or dependency engine incompatibility remains
- **THEN** this issue remains unaccepted without weakening engine declarations, substituting host results or asserting that the historical npm timeout was caused by the version mismatch

### Requirement: Executable bundled Node tool acceptance

Acceptance SHALL exercise tools inside the same complete immutable workspace image as the assistant user, using installed packages and browser assets. Mermaid SHALL render a minimal graph whose SVG contains the expected graph content. tsx SHALL execute a typed fixture with the expected result. tsc SHALL emit JavaScript with the expected behavior and reject an ill-typed fixture. Local pdfjs-dist SHALL read an actual PDF and return its expected page count and text. Version strings or import-only probes SHALL NOT replace these results.

#### Scenario: Actual tool outputs

- **WHEN** the default image harness runs its Node tool probes without WAN access
- **THEN** rendered SVG, compiled/executed TypeScript and parsed PDF results satisfy their independent assertions
- **AND** command failures preserve diagnostic evidence, return failure and leave no owned disposable test resources
