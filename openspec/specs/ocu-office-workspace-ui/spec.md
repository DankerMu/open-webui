# ocu-office-workspace-ui Specification

## Purpose

Define how the Office editing surface in the workspace sidebar presents status and outcomes to the user.

## Requirements

### Requirement: Status word never breaks between letters

The Office editor status bar SHALL keep each word of its status text whole. When the status text, the "Workspace file changed" notice and the editor controls do not fit on one line at the sidebar's width, the bar SHALL wrap whole items onto further lines rather than narrowing the status text below its longest word. A single token wider than the whole bar SHALL wrap inside the bar instead of overflowing it.

#### Scenario: Conflict with a change notice in the default-width sidebar

- **WHEN** the non-maximized sidebar shows the status `Conflict`, the "Workspace file changed" notice and the Save, Version history, Maximize and Close editor buttons
- **THEN** `Conflict` is rendered on one line and the buttons that do not fit move to a further line of the bar

### Requirement: Removal-triggered close names the saved copy

When an open Office editor is closed because its file no longer appears in the workspace listing, for example because it was deleted or replaced by a symbolic link, and the close publish saves the content as a new file, the sidebar SHALL show the user a notification naming that new file. The panel notice that the selected file was removed SHALL remain. When the close saves no new file, no new file SHALL be named.

#### Scenario: File deleted while the user edits

- **WHEN** the editor holds unsaved changes to `report.docx`, a listing refresh no longer contains `report.docx`, and the close status reports `saved_as` `report (2).docx`
- **THEN** exactly one close is issued and the user sees `Office changes saved as a new file: report (2).docx`, together with the notice that the selected file was removed

#### Scenario: Close without an automatic copy

- **WHEN** the file leaves the listing and the close status reports no `saved_as`
- **THEN** no new file is named and the existing outcome reporting is unchanged

### Requirement: The removal-notice case does not depend on hold-phase duration

The browser case for a listing refresh that drops the open Office file SHALL keep the reconciliation run that set the removal notice from finishing until the notice has been asserted, by holding that run's preference write and then letting it complete. The held write SHALL always be continued, never aborted, so the run ends normally.

#### Scenario: Slow hold phase

- **WHEN** more than 3 seconds pass between the removing refresh and the release of the held Office close
- **THEN** the panel still shows `Selected file was removed` after the release, and the held preference write then completes with a success status
