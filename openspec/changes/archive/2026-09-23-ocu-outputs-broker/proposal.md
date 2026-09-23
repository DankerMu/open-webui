# Proposal

Issue type: feature
Fixture level: expanded
Upstream suggested level: expanded (agree: persistent identity, file IO and shared state)
Blast radius: mistaken file identity, lost revision history, unsafe file reads or concurrent index overwrite.
Selected risk packs: Public API; Config; File IO; Schema; Concurrency; Resource limits; Legacy compatibility; Error handling; Packaging; Documentation.
Evidence floor: real-filesystem broker scenarios and process contention; zero hashing on unchanged5000 files; atomic failure/corrupt-index tests; pinned non-Docker suite.

## Why

Issue15 provides a stable file_id and per-chat revision authority before issue16 wires outputs/describe endpoints. Path and mtime alone do not provide stable identity.

## What Changes

- Add a persisted broker under BASE_DATA_DIR/{chat_id}/.ocu/index.json, with active path/fingerprint indexes and tombstones.
- Cache hashes on first observation and detected size change, per the user's decision in issue15 comment5790293452; only observed deletions establish the path-reuse boundary. This amends parent D8's hash-only-on-rename rule.
- Reconcile under the existing lifecycle thread+flock transaction; preserve per-entry revisions, deterministic rename matching and bounded pagination.
- Reject unsafe paths, corrupt indexes and exceeded limits without replacing valid persisted state. Package the pure module; do not wire endpoints yet.

## Capabilities

### New Capabilities

- `ocu-outputs-broker`: persisted output identity, monotonic revisions and bounded filesystem reconciliation.

### Modified Capabilities

None; this slice implements the broker portion of the parent outputs-reconciliation contract.

## Impact

New OCU outputs_broker.py and CI-discovered tests/orchestrator/test_outputs_broker.py; one Dockerfile COPY for the module and minimal existing docs. Reuse lifecycle locking and path validation. No app endpoint, preview.js, URL prefix or broker-to-describe wiring until issue16. No new dependencies or Docker execution.
