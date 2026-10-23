## ADDED Requirements

### Requirement: Too-large workspace files are listed with gated actions

The workspace sidebar SHALL list a file the OCU listing marks too_large together with the other files, with a visible too-large marker and its size. Selecting it SHALL offer download and SHALL NOT load a preview frame of any kind, start an Office preview, or offer Office editing or version history. Files not marked too_large, including entries from a listing that omits the marker, SHALL behave as before; a marker that is present but not a boolean SHALL make the listing an invalid response.

#### Scenario: Oversized files among others

- **WHEN** the listing contains normal files plus a too_large HTML file and a too_large Office file
- **THEN** the sidebar shows all of them, and both too_large rows carry the marker

#### Scenario: Selecting an oversized file

- **WHEN** the user selects the too_large HTML file or the too_large Office file
- **THEN** the panel shows a status naming the preview size limit and a Download action, and no preview frame, Edit or Version history appears

#### Scenario: Standalone preview page

- **WHEN** the OCU standalone preview page lists a too_large file
- **THEN** it does not auto-select it, and selecting it shows the download fallback without fetching the file
