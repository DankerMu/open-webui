# Proposal

## Why

The workspace header, view switch and state messages lack visible hierarchy, active/disabled states and theme-aware panel styling. Issue #179 defines a presentation-only change before the file tree and selected-file work.

## What Changes

- Compact header with loaded-file count and named refresh/close icon buttons.
- Segmented Files/Browser/Terminal switch and styled loading, empty, stopped, unavailable and error states.
- Bordered runtime-frame container; frame attributes and lifecycle remain unchanged.
- New component tests and light/dark screenshots through the existing browser harness; generated localization keys only.

## Capabilities

### Modified Capabilities

- `ocu-workspace-controls`: add presentation and accessibility requirements without changing control semantics.

## Impact

`WorkspaceArtifact.svelte`, one new component test file, existing browser screenshot steps and generated i18n catalogs. No store/API/backend/stub/ChatControls/dependency changes. File list and selected-file markup belong to later issues.

## Fixture Contract

- Level: compact, matching the issue. Styling a Critical Path component requires independent reviewer coverage and A-T01, but iframe policies, messages and request behavior are unchanged.
- Selected risks: UI/public accessibility, schema/names, auth/isolation preservation, async busy state, compatibility, errors and documentation.
- Not selected: filesystem, resource policy, deployment/configuration, packaging/dependencies; no such behavior changes.
- Preserve all current handlers, conditions, role/name selectors, file selection and pagination, generated/Office/runtime frame `sandbox`, `src`, `title`, protocol validation and deadlines.
- Evidence: meaningful mounted-component assertions, unchanged existing suites/selectors, actual `make verify-ui` including the OCU suite/A-T01, dark/light screenshots and zero unexpected console/page errors. No real sandbox or Office editor certification.
