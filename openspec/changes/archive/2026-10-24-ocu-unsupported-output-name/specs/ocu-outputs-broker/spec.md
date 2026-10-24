## MODIFIED Requirements

### Requirement: Persistent identity and event revisions

The broker SHALL persist active path and content-fingerprint indexes, UUID file_ids, tombstones and one monotonic counter per chat. Each observed addition, size change, rename or deletion SHALL increment the counter once and stamp the affected entry or tombstone. Unchanged entries SHALL retain their id and revision. Listing revision SHALL be the current counter, preserved across broker/process restarts. Entry metadata SHALL include relative path, name, size, mtime_ns, revision and cached SHA-256, except that an entry whose size exceeds the per-file limit or whose path is unsupported (a segment that is not valid UTF-8 or contains a backslash) SHALL carry a null hash, and an entry with an unsupported path SHALL NOT carry a hash; mtime SHALL not determine identity or version.

#### Scenario: Independent entry stamps

- **WHEN** a.html changes size while b.html does not
- **THEN** the counter increments once, a.html keeps its id with the new stamp, and b.html keeps its id and stamp

#### Scenario: Restart preserves authority

- **WHEN** a new broker/process reads an existing valid index
- **THEN** unchanged entries retain their ids/stamps and the next event advances the persisted counter

#### Scenario: File crosses the per-file limit

- **WHEN** an indexed file grows beyond the per-file limit, and later shrinks back below it
- **THEN** each crossing is one size-change event that keeps the file's id, and the entry's hash is null while the file is oversized and a fresh SHA-256 once it is back within the limit

### Requirement: Cached hash rename evidence

The broker SHALL hash newly observed files and detected size changes within the per-file limit and persist those fingerprints. Files over the per-file limit and files with an unsupported path SHALL NOT be read or hashed and SHALL have no fingerprint. Equal-size/equal-SHA256 pairs of paths removed and added in the same reconciliation SHALL be matched one-to-one deterministically as renames, retaining id and incrementing revision once; entries without a hash SHALL never be rename candidates. Equal-content files SHALL have distinct identities. Historical tombstones SHALL never be candidates for rename resurrection. Same-size in-place changes remain a documented detection blind spot.

#### Scenario: Rename retains identity

- **WHEN** indexed report.html is renamed to final.html between reconciliations without changing its content
- **THEN** final.html keeps report.html's id, its revision increments once, and the live id is not tombstoned

#### Scenario: Same-size different content is not a rename

- **WHEN** an indexed file disappears and another path appears with the same size but a different SHA-256
- **THEN** the old id is tombstoned and the new path receives a distinct id

#### Scenario: Duplicate content remains distinct

- **WHEN** multiple removed and added paths share one size/hash
- **THEN** deterministic one-to-one matching preserves separate ids without assigning one id to two active entries

#### Scenario: Oversized files are never paired

- **WHEN** two oversized files of equal size are moved in the same reconciliation
- **THEN** each old id is tombstoned and each new path receives a new id

## ADDED Requirements

### Requirement: Unsupported output names are listed without being served

A regular file under the outputs root whose path has a segment that is not valid UTF-8 or contains a backslash SHALL be indexed as an active hashless entry with its own file_id and revision events, SHALL never be read, and SHALL be listed with `unsupported_name: true`, a display path and no URL. Such a name SHALL NOT fail the listing, and a symbolic link or special file with such a name SHALL contribute nothing. Office session creation SHALL refuse the entry with `unsupported_name` and the archive download SHALL omit it. Supported paths SHALL keep every existing identity, revision, rename and limit rule.

#### Scenario: Listing with a non-UTF-8 name

- **WHEN** a chat's outputs hold normal files, a file whose name is not valid UTF-8, a file inside a directory whose name is not valid UTF-8, and a symbolic link whose name is not valid UTF-8
- **THEN** the listing succeeds with every normal file unchanged and both non-UTF-8 files as entries marked `unsupported_name` with no URL, the link is absent, and neither file's content is read

#### Scenario: Index round-trip

- **WHEN** the index holding such an entry is written and read back and the chat is reconciled again without changes
- **THEN** every file_id and revision is unchanged and two unchanged listings return the same ETag

#### Scenario: Restore validates a captured index that records the entry

- **WHEN** restore validates a live chat's captured index that records such an entry with the selected release's broker
- **THEN** validation succeeds, the index is unchanged and restore continues

#### Scenario: Actions are refused

- **WHEN** an Office session is requested for such an entry, or the chat's archive is downloaded
- **THEN** the session is refused with `unsupported_name` without reading content, and the archive omits the entry
