# Proposal

## Why

Issue365 identifies atomic successors that remain visible after final directory-close failure while callers receive an ordinary unsaved/corrupt-state error. Cleanup can also mask an earlier write failure or stop before the other owned directories receive a close attempt.

## Triage

- Issue type: bugfix.
- Fixture level: expanded.
- Upstream suggested level: absent; expanded because three atomic writers and their public error consumers share the correction.
- Blast radius: persisted index/receipt/Office state classification, referenced version blobs, upload replay and Office publication recovery.
- Selected risk packs: Public API; File IO; Schema/fields; Auth/secrets; Concurrency/ordering; Legacy compatibility; Error handling; Documentation.
- Evidence floor: semantic RED/GREEN for each writer and caller, real filesystem/HTTP probe, focused adjacent regression matrix, three-seat review and scoped gates.

## What Changes

- Report a final directory-close failure after successful replacement and directory synchronization as an explicit committed atomic-write outcome, without swallowing the IO error or claiming the entire enclosing upload/publication completed.
- Preserve the earlier primary failure and every later directory-close error; attempt each owned final directory descriptor once without retrying an uncertain close.
- Retain visible state and referenced blobs, existing same-id upload replay, directory-fsync failure classification and publication recovery.

## Capabilities

### New Capabilities

- `ocu-atomic-write-outcomes`: classify final directory-close failures and primary/cleanup precedence for the index, import-receipt and Office-state atomic writers. Complements existing broker atomicity and active Office storage contracts; does not replace them.

### Modified Capabilities

None. Existing status policies remain; the new capability defines the additional committed-close error detail and cleanup boundary.

## Impact

OCU atomic writers, their shared descriptor cleanup seam, direct and transitive upload/broker/Office consumers, focused tests and existing error-contract decisions. No schema migration, dependency, image, qualified SHA pin, deployment, automatic retry or data deletion policy change. Pre-replace temporary-file-close behavior is outside scope; the claim concerns owned final directory cleanup, not every filesystem cleanup in the application.
