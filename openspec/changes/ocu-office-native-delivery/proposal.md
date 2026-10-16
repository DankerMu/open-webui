# Proposal

## Why

The shared Office host can credit a broker no-change save and destroy the native editor before its reported changes reach DocumentServer. The real XLSX counterexample in [#427](https://github.com/DankerMu/open-webui/issues/427) loses a locally verified edit after the faster close in #425; the [causal diagnosis](https://github.com/DankerMu/open-webui/issues/427#issuecomment-6192921427) establishes native delivery as a separate boundary from broker persistence and publication.

## What Changes

- Gate explicit publication, automatic persistence and host-requested close on delivery of SDK-reported local modifications.
- Keep save coverage bound to modifications eligible at dispatch; a committed watermark cannot cover a later or undelivered edit.
- Revalidate native delivery before releasing the editor after accepted close; keep delivery events and failure handling alive through that boundary.
- Retire delivery waits with the existing host lifetime, command supersession and final/error handling. Preserve forced-removal cleanup without pretending it successfully saved content.
- Update the shared host contract and owning regressions. Qualify the production repair without the diagnostic HTTP barrier, including published XLSX bytes and a genuinely fresh native readback.

## Capabilities

### New Capabilities

- `ocu-office-editor-embed`: add native-delivery requirements to this existing in-flight capability. Its original host contract is in `ocu-office-editing`; no main spec exists yet. Reuse its exact capability path rather than inventing a second editor capability.

### Modified Capabilities

None in the main spec store. Reconcile the in-flight host coverage and close clauses in the same companion change.

## Impact

Production ownership stays in OCU `computer-use-server/static/office-editor.js`, with behavioral regressions in `tests/orchestrator/test_office_editor.py`. No public message fields, broker routes, storage schema, dependency, timeout or deployment configuration change is selected. WebUI contains the fixture and contract/decision updates; its paused #172 verifier and pin remain unchanged. #425 stays unmerged until its own integration acceptance passes.

## Fixture and risk triage

Issue type: bugfix.
Fixture level: **expanded**.
Upstream suggested level: absent; shared host state, teardown and publication risk require expanded. The issue's diagnosis prerequisite is resolved by the linked source/API/runtime evidence.
Blast radius: silent loss of native edits, false-clean state, leaked waits or requests after retirement, and save/close arbitration across all Office formats.
Selected risk packs: Public API; File IO; Auth; Concurrency; Resource limits; Legacy compatibility; Error handling; Release; Documentation. Persisted schema and configuration remain unchanged.
Evidence floor: semantic host RED/GREEN, owning host/request/preview regressions, real unbarriered B1 XLSX edit/save/close/fresh-readback and published-file checks on the #427+#425 composition, exact old-cell negative control, cleanup/source preservation, strict fixture/doc/decision checks and independent cross-review.
