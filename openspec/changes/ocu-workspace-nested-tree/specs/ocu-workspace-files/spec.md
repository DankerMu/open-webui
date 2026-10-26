## MODIFIED Requirements

### Requirement: Loaded workspace files have deterministic display rows

The display model SHALL build a folder hierarchy from the slash-separated relative paths of the loaded files. Each distinct nonempty directory prefix SHALL produce one folder row carrying its full path, its last segment as display name and its depth (segment count minus one). Rows SHALL be ordered depth-first: under each folder, and at the root, all child folders by display name, then all files by display name. A three-level directory SHALL produce three nested folder rows. Leading or doubled slashes SHALL NOT create empty directory segments; path case SHALL remain distinct. File rows SHALL carry the original file, its last path segment as display name (or its `name` when the path has no segment), its depth (number of directory segments) and its parent directory path (empty for root files). File identity SHALL remain `file_id`, folder identity its full directory path. Input records and input ordering SHALL NOT be mutated. Rows SHALL NOT carry loaded-file counts.

Ordering SHALL be recomputed with code-unit lexicographic comparison of display names. Comparison SHALL NOT depend on host locale.

A row SHALL be hidden by collapse exactly when one of its proper ancestor folders is collapsed. Ancestors SHALL be computed on whole path segments, so collapsing `a` hides `a/b` and its files but not `ab`. A collapsed folder row itself SHALL remain visible.

#### Scenario: Nested, same-name and root files

- **WHEN** loaded files include root files and files in two directories, including a three-level path and equal basenames in separate directories
- **THEN** each directory prefix has exactly one folder row at its depth, folders precede files at every level, each file retains its own identity, display name and parent path, and root files follow root folders

#### Scenario: Empty and redundant path separators

- **WHEN** input is empty, root-only, contains a leading or doubled slash, or contains directories differing only in case
- **THEN** output respectively is empty, has only depth-zero file rows, contains no empty directory segment, or keeps the two case-distinct folder rows

#### Scenario: Another loaded page preserves prior file identities

- **WHEN** a second page is appended to the previously loaded files
- **THEN** every earlier file retains its identity, name and parent, folder rows are added only for new prefixes, and new files participate in the same deterministic ordering

#### Scenario: Collapse hides by ancestry

- **WHEN** an intermediate folder is collapsed in a tree that also has a sibling folder whose name extends it as a prefix
- **THEN** every deeper folder and file under the collapsed folder is hidden, the collapsed folder row and the sibling folder's rows stay visible

### Requirement: Grouped workspace rows form an accessible local file tree

The Files list SHALL render the display rows as an explorer tree: each row indented by its depth with decorative indent guides, root rows unindented, and a flat listing having no folder row. A folder row SHALL be a real button with a chevron, a decorative folder icon and its segment name; its accessible name SHALL start with a word such as `Folder` followed by its full directory path, and its `aria-expanded` SHALL reflect local collapse. Folders SHALL start expanded. Collapse SHALL hide the folder's descendants without requests, persist only for the open panel and reset after closing/reopening; it SHALL NOT change file selection or another chat.

Each file row SHALL be a whole-row button with an empty chevron slot so names align with folder names, a decorative kind icon and a truncated display name with full-path tooltip; it SHALL NOT show the file size, except that a file marked too_large SHALL keep its muted size beside its too-large marker. Its accessible name SHALL remain exactly `file.name || file.path`, excluding icon and marker. No added non-file button SHALL introduce a file-name accessible label that collides with existing substring row selectors. Rows SHALL use existing theme-aware utilities, approximately 28 px height, 16 px kind and folder icons, rounded hover/selected backgrounds and visible keyboard focus. Selected rows SHALL retain `aria-pressed=true` and a visible selected style hook. The existing selection callback and selected Office re-click preview restart SHALL remain unchanged.

Accepted listing metadata for an existing `file_id` SHALL update its displayed glyph to the current display kind without requiring reselection or replacing the selectable row element. Its selection and accessible name SHALL remain coherent with the current file. An in-place kind transition that does not move the row SHALL preserve focused-row continuity. Display updates SHALL NOT change classification rules or preview/edit eligibility.

#### Scenario: Nested and flat listings

- **WHEN** loaded files contain two directories, a three-level directory and root files, or instead contain only roots
- **THEN** the former shows nested folder rows with increasing indentation, kind icons and no row sizes other than too_large rows, while the latter has no folder row
- **AND** existing accessible file names and selected-file identity remain unchanged

#### Scenario: Local collapse does not request or retarget

- **WHEN** an intermediate folder is collapsed and expanded, then the panel is closed and reopened or changes chat
- **THEN** all its descendant rows hide/reappear without a request or selection change, and the new panel/chat begins expanded

#### Scenario: Stable identity crosses display kinds on refresh

- **WHEN** an accepted refreshed listing keeps a selected file's `file_id` but changes its path and type/MIME to a different display kind
- **THEN** its actual displayed SVG changes to the new kind and agrees with its current kind metadata without another selection action
- **AND** the same selectable row retains its selection, updates its accessible name and keeps focus when its position is unchanged
- **AND** the existing classifier, hierarchy, selected-file presentation and preview/edit policy remain unchanged

### Requirement: File tree preserves pagination and preview space

More files SHALL remain a named, muted full-width control after the loaded rows, present only when another page exists and disabled while busy; it SHALL invoke the existing pagination action. The list SHALL scroll independently. With a selected file its height SHALL be capped at approximately two fifths of the panel so the preview retains remaining space; with none selected it MAY use the full available height. Header presentation, iframe authority and protocol SHALL remain unchanged.

#### Scenario: Selection and another page

- **WHEN** a row is clicked, clicked again for an already selected Office file, or More files is activated
- **THEN** the existing respective selection/restart/pagination behavior occurs without duplicate actions
- **AND** with a selection the scrolling list leaves remaining height for preview, while More files is absent without a cursor and disabled during its request

#### Scenario: Browser proof uses real nested fixtures

- **WHEN** the browser harness creates the nested-list scenario chat and opens Files in light and dark themes
- **THEN** it asserts nested folder rows, depth indentation, collapse/expand of an intermediate folder and selection styling, captures both screenshots and has zero unexpected console/page errors
- **AND** existing browser selectors and A-T01 generated-content isolation continue to pass
