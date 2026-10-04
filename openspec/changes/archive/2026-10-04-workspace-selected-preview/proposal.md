# Proposal

## Why

Issue #182 replaces the bare selected-file download link and unframed preview with a compact file bar and bounded preview surface, without changing preview authority or lifecycle.

## What Changes

- Selected-file kind/name/directory/size bar with an icon download link; framed remaining-height preview.
- Presentation of Office pending/failure/retry and unsupported states; four browser screenshots.
- Replace the prior tree requirement's selected-preview presentation freeze with this explicit presentation contract. Header, list and frame behavior stay unchanged.

## Capabilities

Modified: `ocu-workspace-files`. No new capability. Compact fixture; design.md omitted.

## Impact

WorkspaceArtifact selected-file markup and local display metadata, one new component test file, screenshot steps in an existing browser case, generated i18n if needed, and owning documentation. No store/API/backend/stub/ChatControls/dependency change.

## Triage

Issue type: feature
Fixture level: compact
Upstream suggested level: compact (agree: local presentation only; protected frame/protocol code is unchanged)
Blast radius: selected-file display, download accessibility and preview layout
Selected risk packs: legacy compatibility/examples; error handling/partial outputs; documentation/migration notes
Evidence floor: semantic RED/GREEN, literal frame/download contracts, existing component/browser suites including A-T01, four inspected screenshots, scoped static/doc gates and exact-head CI
