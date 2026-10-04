# Proposal

## Why

Issue #181 renders the merged display-row model as a compact file tree. File names alone do not expose directory context, kind, size or visible selection.

## What Changes

- Folder headers with local collapse, indented file rows with kind icons/size, selected/hover/focus states and a bounded scrolling area.
- One nested-path stub scenario and one configured browser case with light/dark screenshots.
- New component tests and generated localization strings; existing selectors and controller behavior retained.

## Capabilities

### Modified Capabilities

- `ocu-workspace-files`: tree presentation and local collapse of loaded directory groups.

## Impact

`WorkspaceArtifact`, a new component test, stub scenario/data serving, browser scenario inventory and case, generated i18n. No store/API/backend/ChatControls, header, selected-file bar or frame-policy change. Reuse `workspace-file-rows` unchanged and `$lib/utils.formatFileSize`; use inferred function return types rather than adding an unnecessary exported alias. TSV classification limitation stays tracked in #239, not repaired or asserted as correct here.

## Fixture Contract

Compact, matching the issue; design.md omitted. Critical Path review still covers unchanged iframe authority and A-T01. Selected risks: UI/accessibility, identity/names, local state lifetime, compatibility/partial pages, fixture HTTP paths, errors and docs. No persisted-schema, auth-policy, resource quota, dependency or deployment change. Must preserve file selection, selected Office re-click, pagination, reconciliation, frame source/title/sandbox and message validation. Target400 lines excluding generated i18n/images; justify any natural overage rather than compress code or weaken evidence.
