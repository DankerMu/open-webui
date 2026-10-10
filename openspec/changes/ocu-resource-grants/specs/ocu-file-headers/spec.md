## ADDED Requirements

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
