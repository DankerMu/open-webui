# Proposal

## Why

Issue #239 identifies broker TSV metadata (`spreadsheet`, `text/tab-separated-values`) that the workspace display classifier maps to `other`. The classifier now has real list-row and selected-file icon consumers; this is no longer the issue's original latent-only state.

## What Changes

- Recognize the broker spreadsheet type and TSV media type as `sheet` in the existing maps.
- Preserve recognized-MIME precedence, normalization, CSV/XLSX and unrelated classifications, file identity, and preview/edit eligibility.
- Add focused regressions and browser evidence through existing consumers; do not add filename heuristics, change broker payloads or modify UI implementation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-workspace-files`: extend the existing display-kind requirement to TSV and explicit MIME-first fallback behavior.

## Impact

Production scope is `src/lib/components/chat/workspace-file-rows.ts`. Tests reuse its paired test and the existing browser tree harness. `WorkspaceArtifact` and `WorkspaceSelectedFile` remain unchanged. The producer is OCU `classify_file`, whose `.csv`/`.tsv` branch returns `spreadsheet` with detected MIME. Update the existing workspace-file-tree decision after runtime proof rather than create a second classification policy.

## Risk triage

Issue type: bugfix.
Fixture level: compact.
Upstream suggested level: absent; isolated display lookup addition with unchanged interfaces and state.
Blast radius: wrong decorative file kind; no capability, parser, persisted format or authorization change.
Selected risk packs: Legacy compatibility / examples; Documentation / migration notes.
Evidence floor: semantic RED/GREEN, all issue fallback/precedence cases, actual mounted TSV icon and unchanged capability proof, frontend regression/type/scoped lint/coverage, UI harness screenshots and zero unexpected console/page errors, docs/strict/format.
Design omitted at compact level; the existing classifier owns the policy and no architecture choice changes.
