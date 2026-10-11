# ocu-output-archives Specification

## Purpose

Allow users to download completed visible workspace output files as a ZIP without exposing hidden staging or internal entries.

## Requirements

### Requirement: Visible output archive membership

An authenticated output archive request SHALL omit files whose output-relative path contains any dot-prefixed component, including `.upload-*` residue and visible leaves beneath hidden directories. Visible completed files SHALL retain their relative ZIP names and complete bytes. Hidden files SHALL remain untouched on disk. Existing archive authorization, response headers and missing/empty-directory errors SHALL remain unchanged.

#### Scenario: Active or stale hidden upload residue

- **WHEN** an open `.upload-*` file or a closed stale `.upload-*` file exists alongside a completed visible file
- **THEN** the ZIP contains the completed file with its full bytes and contains neither hidden entry
- **AND** the reader does not remove or modify those hidden files

#### Scenario: Hidden ancestor and visible nested output

- **WHEN** a hidden directory contains a visible leaf and an ordinary visible directory contains a completed file
- **THEN** the ZIP omits the hidden subtree and includes the visible nested file under its relative path with complete bytes

#### Scenario: No visible files

- **WHEN** the outputs directory contains only hidden files or files beneath hidden directories
- **THEN** the archive request returns the existing no-files HTTP404 response rather than a successful ZIP containing hidden data

#### Scenario: Published uploads remain archivable

- **WHEN** two successful uploads of distinct content request the same visible name
- **THEN** the archive contains both actual stored names with their complete distinct payloads
- **AND** archive filtering does not change no-replace publication, collision naming, attachment receipts or writer cleanup

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
