## MODIFIED Requirements

### Requirement: Separate generated and Office preview trust

Generated HTML/SVG/XML not marked too_large SHALL load its canonical current-chat cookie URL in an iframe fixed to allow-scripts allow-forms. Office SHALL use the merged restricted preview protocol in a separate trusted iframe fixed to allow-scripts allow-same-origin allow-forms. Parent responses SHALL be validated by source/origin/schema/chat/file/generation and stale responses ignored. User iframe settings SHALL not widen either policy. A file marked too_large or unsupported_name SHALL load neither iframe, whatever its type. Corrupt/unsupported Office SHALL yield a visible per-file state and usable parent-owned download fallback, not blank success.

#### Scenario: Real Office consumer

- **WHEN** valid and corrupt Office files are selected through the actual WebUI sidebar
- **THEN** the real OCU renderer reports current-generation ready/error, valid content is visible and failure exposes a working parent download
- **AND** wrong-source, wrong-chat and stale results cannot change current selection

#### Scenario: A-T01 three open paths

- **WHEN** generated HTML and scripted SVG open via the sidebar (including an ordinary recognized message click), an explicit modified new-tab message-link gesture, and a directly entered file URL while the user enables same-origin sandbox settings
- **THEN** script and inline CSS/data-image work but storage/parent-token access remains blocked and the execution origin is opaque
- **AND** relative stylesheet retrieval receives401 as the documented limitation, without widening the sandbox or granting credentials

#### Scenario: Office frame does not complete

- **WHEN** the Office frame never becomes ready within10 seconds or never reports a terminal selection result within30 seconds of dispatch
- **THEN** the panel retires that frame generation and shows a timeout error, parent download and explicit Retry
- **AND** late success cannot dismiss the timeout, and close/change/unmount clears both owned deadlines

### Requirement: Selected file has a compact metadata and download bar

The selected region SHALL retain the accessible name `Selected workspace file`. Its one-row hairline-bordered bar SHALL show a decorative kind icon consistent with the list, a medium-weight truncated filename with full-name tooltip, muted directory only for nested files, and muted canonical formatted size. It SHALL use existing theme-aware compact row utilities and leave action space on the right. The icon download action SHALL remain an anchor with the unchanged URL, download filename and accessible name `Download <name>`, plus a tooltip; a file marked unsupported_name has no URL and SHALL show no download action. It SHALL NOT add a filename-labelled button or another action.

#### Scenario: Root and nested selected metadata

- **WHEN** a root file or nested file is selected
- **THEN** the bar shows its display basename, kind and formatted size, with the full directory only for the nested file
- **AND** its download link retains the original href, download attribute and accessible name; long names remain available through the tooltip

### Requirement: Selected preview is framed without changing preview behavior

The preview surface below the bar SHALL be rounded, bordered and clipped at its corners, and fill remaining height; its iframe SHALL have no border of its own. Generated-content and Office iframe sandbox, source and title values SHALL remain identical to the accepted reference. Preview selection, keyed lifecycle, message validation and deadlines SHALL remain unchanged. Office pending status SHALL retain its existing text and `role="status"`, with a decorative spinner; failure SHALL retain its status text/role and `Retry Office preview` action in a styled error block. Unsupported files, and files marked too_large with a status text naming the preview size limit, SHALL show a centered decorative kind icon, existing status text and a download action styled as a button. This secondary action SHALL be an anchor named `Download`, without the filename, so the single existing `Download <name>` link selector remains unambiguous. It SHALL perform the same download, not add an open/copy/revision action. A file marked unsupported_name SHALL show the icon and a status text explaining that the name cannot be opened here, without a download action.

#### Scenario: Generated, Office and unsupported branches

- **WHEN** generated content, a connecting/rendering/failed Office file, or an unsupported file is selected
- **THEN** the respective existing branch renders inside the framed surface, pending Office status has a spinner and failure has the unchanged retry action
- **AND** retry retains its original frame restart behavior, downloads remain available and unsupported content retains its status role

#### Scenario: Browser presentation and isolation

- **WHEN** a selected HTML file and an unsupported file are viewed in light and dark themes
- **THEN** four screenshots show the bar and framed surface without horizontal overflow, with remaining height available to the preview
- **AND** existing selectors and A-T01 opaque-origin behavior pass with zero unexpected console/page errors

## ADDED Requirements

### Requirement: Unsupported-name workspace files are listed without actions

The workspace sidebar SHALL list an entry marked `unsupported_name` with its display name and an "Unsupported name" marker, SHALL offer no Office, preview or download action for it, and SHALL explain on selection that the name cannot be opened here. A listing entry whose `unsupported_name` is present and not a boolean, or whose URL is null while it is not marked unsupported, SHALL make the listing invalid.

#### Scenario: Unsupported entry in the sidebar

- **WHEN** a listing contains a normal file and an entry marked `unsupported_name` with a null URL
- **THEN** both rows are shown, the unsupported row carries the marker and no action, and selecting it shows the explanation without a download link

#### Scenario: Malformed marker

- **WHEN** a listing entry has a non-boolean `unsupported_name`, or a null URL without the marker
- **THEN** the listing is rejected as an invalid response
