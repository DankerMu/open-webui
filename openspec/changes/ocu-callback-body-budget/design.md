# Callback body admission

## Change surface

The existing `admit_callback` route and its token-verification helper own admission. The router's public path and the verified processing handoff stay intact. Use the existing raw-header presence semantics, including empty/invalid values; no second authentication implementation.

## Governing invariant

A present Authorization is authoritative without body reads; only absent-header requests accumulate at most 1,048,576 raw bytes, and rejected admission cannot download, persist, publish or change Office state.

## Must preserve

- Sandbox-peer denial occurs before callback work; Office-disabled behavior, control-plane-only routing and internal-token exemption remain unchanged.
- Header JWT uses the verified nested payload; body JWT uses its existing verified object. Unsigned fields are ignored. Invalid existing headers never fall back to body credentials.
- Canonical chat admission, session/document-key binding, all callback processing, source tickets and `/office/source` behavior remain unchanged.
- Under-budget malformed JSON/JWT retains the existing HTTP 401 `invalid_token` envelope; do not add `error` to unrelated existing error bodies.

## Mechanism

Select the authoritative header branch before any body operation. In the absent-header branch consume `Request.stream()` incrementally, checking the new total before appending each chunk. Accept the inclusive limit. Reject overflow immediately without parsing or draining further application chunks. The fixed bound needs no env knob. Content-Length is not authoritative; ignoring it is a safe minimal implementation, and actual accumulated bytes must govern even when absent or forged small.

## Sibling surfaces

`office/router.py`, `auth_guard.py` and application middleware order; `office/tokens.py`; downstream `callback.py`, store and download/publish owners; source delivery; existing DocumentServer fixtures. Audit these read-only for invariant preservation, without changing their policies.

## Seams and required evidence

- Real application ASGI receive gate: valid, invalid, empty, whitespace and non-Bearer present headers cannot invoke receive or body JSON parsing; valid header still processes status 1, rejected headers leave snapshots unchanged even with a valid body credential available.
- Exact raw-byte limit accepts a valid body token and transitions opening to editing. One byte over, many-chunk crossing, missing Content-Length and forged-small length produce exact 413 with unchanged files/state and zero download. Include multibyte data so byte/character confusion fails.
- Overflow observation fails if JSON parsing or another receive occurs after crossing; instrument the owning parse dependency narrowly, not the callback implementation. Existing malformed/invalid credential and normal DocumentServer cases remain mandatory.
- Parent-run throwaway runtime uses the actual application boundary and real temporary store; ASGI is authoritative for forged framing/no-receive claims, while a local HTTP path covers valid and rejected callback responses. No Docker or LAN certification.
- Run owning callback, router/auth, processing and concurrency suites, then source unit CI. Parent records commands, input hashes, outcomes and scans public evidence for credentials. Reviewers independently check fixture and full diff.

## Non-goals and rollback

No callback-processing rewrite, total-process-memory guarantee, admission concurrency policy, socket timeout policy, transport chunk-size guarantee or exhaustive DocumentServer deployment compatibility. The transport may already allocate a large input chunk; the application must not append/copy/parse the entire oversized body. Document bytes still arrive through the separately authenticated URL download. Rollback reverts the issue commit; no persisted format migration.
