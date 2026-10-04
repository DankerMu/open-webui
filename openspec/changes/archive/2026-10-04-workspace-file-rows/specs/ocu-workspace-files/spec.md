# Spec Delta

## ADDED Requirements

### Requirement: Loaded workspace files have deterministic display rows

The display model SHALL group loaded files by the full directory portion of their slash-separated relative paths. Each distinct nonempty directory SHALL produce one folder row containing its path and loaded-file count, followed by its files in name order; folders SHALL be in path order and root files SHALL follow all folders in name order without a root folder row. A three-level directory SHALL remain one full-path header, not an intermediate folder hierarchy. Leading or doubled slashes SHALL NOT create empty directory segments; path case SHALL remain distinct. File rows SHALL carry the original file, its last path segment as display name (or its `name` when path is empty), and whether it is nested. File identity SHALL remain `file_id`, folder identity its directory path. Input records and input ordering SHALL NOT be mutated.

Ordering SHALL be recomputed with code-unit lexicographic comparison: folders by full directory path and files by their display name (last path segment, or `name` when path is empty). Comparison SHALL NOT depend on host locale.

#### Scenario: Nested, same-name and root files

- **WHEN** loaded files include root files and files in two directories, including a three-level path and equal basenames in separate directories
- **THEN** each directory has one ordered full-path row and correct loaded count, each file retains its own identity and display name, and root files come last without a header

#### Scenario: Empty and redundant path separators

- **WHEN** input is empty, root-only, contains a leading or doubled slash, or contains directories differing only in case
- **THEN** output respectively is empty, has only file rows, contains no empty directory segment, or keeps the two case-distinct directory groups

#### Scenario: Another loaded page preserves prior file identities

- **WHEN** a second page is appended to the previously loaded files
- **THEN** every earlier file retains its identity/name and group, folder counts reflect the combined loaded files, and new files participate in the same deterministic ordering
- **AND** a count describes only loaded files, not complete server enumeration or deletion evidence

### Requirement: Workspace display kinds use broker type and MIME

The pure classifier SHALL return one of `web`, `image`, `document`, `sheet`, `slides`, `code` or `other`, from case-insensitive broker `type` and the media type portion of `mime`. HTML/SVG/XML SHALL be web; image formats image; DOCX/PDF/text/Markdown document; XLSX/CSV sheet; PPTX slides; JSON/scripts/source files code. Unknown or empty classification inputs SHALL yield other. Display classification SHALL NOT change preview or editing eligibility and SHALL NOT infer a different identity from filenames.

#### Scenario: Kinds and media-type normalization

- **WHEN** representative files for all seven kinds include uppercase type/MIME values, `text/html; charset=utf-8`, and unknown/empty values
- **THEN** each known file yields its specified kind regardless of case or MIME parameters, and unknown/empty inputs yield other
