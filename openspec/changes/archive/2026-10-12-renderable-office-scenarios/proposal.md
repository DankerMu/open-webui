# Proposal

## Why

The unpublished and stale Office stub scenarios ignore the browser harness's valid DOCX input, so their read-only previews cannot support trustworthy visual evidence. Issue [269](https://github.com/DankerMu/open-webui/issues/269) requires renderable version bytes without changing the lifecycle and request-order contracts.

## Risk triage

- Issue type: bugfix.
- Fixture level: expanded; upstream suggested level absent.
- Reason: shared fixture reader/writer, DOCX format and version-state consumers.
- Blast radius: deterministic stub HTTP metadata/history and browser evidence, not production document handling.
- Selected packs: script entry, config, file IO, schema/content metadata, ordering/state, compatibility, error paths, documentation.
- Evidence floor: baseline semantic RED, configured DOCX HTTP/content/metadata proof, unchanged unconfigured scenario behavior, full existing stub smoke and browser harness with recognizable preview screenshots and no unexpected diagnostics.

## What Changes

- Use the configured DOCX as the workspace version for both specialized scenarios and derive a distinct renderable autosave version.
- Retain version numbering, parent/published flags, identity, restore/history, stale refusal and retry semantics.
- Strengthen the existing browser scenario evidence to wait for recognizable read-only document content before capture; preserve prompt and request-order assertions.
- Reuse the existing valid-DOCX fixture generator if shared smoke inputs require migration; retain one generator and no binary fixture copies.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-stub`: configured renderable Office scenario versions and unchanged lifecycle evidence.

## Impact

Owning seam: `scripts/ocu_stub_office.py`; consumers: browser fixture generation, Office smoke/regressions and `e2e/ocu-office-fixtures.ts`. Update the owning stub decision and clarify the historical preview-evidence limitation. No frontend production, real DocumentServer, deployment, dependency or intentionally corrupt fixture changes. Unconfigured route-only bytes remain unchanged.
