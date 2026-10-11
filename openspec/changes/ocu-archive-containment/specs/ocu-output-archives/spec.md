# Spec Delta

## ADDED Requirements

### Requirement: Confined archive payload reads

Archive creation SHALL read only securely opened regular files beneath the requested chat outputs root, without following symlinks at the root, ancestor or leaf. A symlink candidate SHALL be omitted or cause a closed error, including when its target is inside the same outputs tree. ZIP creation SHALL NOT reopen an unchecked workspace pathname after selection. An unsafe read SHALL NOT return a partial successful ZIP. Ordinary visible files SHALL retain their output-relative names and exact bytes; existing hidden-entry exclusion, authorization and successful response headers SHALL remain intact.

#### Scenario: Outside and sibling-chat canaries

- **WHEN** a visible symlink points to a benign marker just outside outputs or inside a sibling chat outputs directory
- **THEN** the response omits the link or fails closed and never includes target bytes
- **AND** an ordinary nested file remains archivable with its relative name and exact bytes when no unsafe member prevents the response

#### Scenario: In-tree link and linked ancestor

- **WHEN** an archive candidate is a symlink to an in-tree file or lies beneath a symlinked directory
- **THEN** archive creation does not follow that link and either omits it or fails closed

#### Scenario: Replacement after selection

- **WHEN** a candidate leaf or ancestor is replaced with a symlink after enumeration and before its payload is opened
- **THEN** the response does not include bytes from the replacement target and cannot report a partial ZIP success after an unsafe read

#### Scenario: Root replacement

- **WHEN** the chat or outputs root is replaced with a symlink before payload acquisition
- **THEN** archive creation fails closed or omits the unsafe content without reading the linked target

#### Scenario: Pre-existing root aliases

- **WHEN** the requested chat root is already a symlink to a sibling chat, or its outputs root is already a symlink to sibling outputs before the request
- **THEN** the response omits unsafe content or fails closed and never includes the sibling's benign canary bytes
- **AND** containment is relative to the requested chat, not a resolved sibling root inside the shared base directory
