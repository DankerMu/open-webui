# Proposal

## Why

Issue #310 identifies a mismatch between Office fragment resolution and the pinned sanitizer's idempotent ID namespace. Already-prefixed bookmark targets survive sanitization but their links receive a second prefix and lose navigation.

## What Changes

- Apply the existing idempotent namespace rule to decoded Office fragments, retaining fragment-local membership validation.
- Extend the existing browser harness with real DOCX bookmark clicks and rejection controls; preserve other renderer policies.

## Capabilities

### Modified Capabilities

- `ocu-preview-spa`: ordinary and already-prefixed Office bookmarks remain navigable without weakening sanitization.

## Impact

- Issue type: bugfix
- Fixture level: expanded
- Upstream suggested level: absent
- Blast radius: shared DOCX/XLSX converted-HTML fragment boundary
- Selected risk packs: public input, security, compatibility, error handling, documentation
- Evidence floor: real DOCX semantic RED/GREEN, actual click/viewport screenshots, malformed/missing/external-target rejection, existing browser harness and relevant preview regressions

Only the Office fragment mapping changes. No Markdown policy, sanitizer configuration/version, image/external-link policy, dependency, deployment or runtime-service changes.
