## ADDED Requirements

### Requirement: Removal-triggered close names the saved copy

When an open Office editor is closed because its file no longer appears in the workspace listing, for example because it was deleted or replaced by a symbolic link, and the close publish saves the content as a new file, the sidebar SHALL show the user a notification naming that new file. The panel notice that the selected file was removed SHALL remain. When the close saves no new file, no new file SHALL be named.

#### Scenario: File deleted while the user edits

- **WHEN** the editor holds unsaved changes to `report.docx`, a listing refresh no longer contains `report.docx`, and the close status reports `saved_as` `report (2).docx`
- **THEN** exactly one close is issued and the user sees `Office changes saved as a new file: report (2).docx`, together with the notice that the selected file was removed

#### Scenario: Close without an automatic copy

- **WHEN** the file leaves the listing and the close status reports no `saved_as`
- **THEN** no new file is named and the existing outcome reporting is unchanged
