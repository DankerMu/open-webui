# Tasks

## 1. Broker authority

- [ ] 1.1 Record user-selected hash caching and observed-deletion boundaries in a proposed decision record and parent D8 amendment; obtain expanded fixture review and strict validation before implementation.
- [ ] 1.2 Add outputs_broker.py using the existing combined lifecycle lock and atomic persisted index. Tests/orchestrator/test_outputs_broker.py exercises first-use UUIDs, per-event counter/stamps, process restart and concurrent-process reconciliation over real temporary directories.
- [ ] 1.3 Implement cached SHA-256, one-to-one rename matching and tombstone non-resurrection; prove rename, same-size different-content replacement, duplicate fingerprints, observed path reuse and size change with forged mtime. Record known same-size/unobserved-reuse limits.
- [ ] 1.4 Implement bounded no-follow enumeration, stable-read failure, index validation/atomic failure and pagination/stale-cursor errors; tests assert unchanged prior index on rejected input/precommit failure, no outside reads and zero hashes/no rewrite for5000 unchanged files.
- [ ] 1.5 Add one Dockerfile COPY for the broker and document limits/API in existing server README/changelog; leave app endpoint and preview.js untouched. Verify module imports without any Docker connection.

## 2. Evidence and review

- [ ] 2.1 Parent executes pinned Python3.12 non-Docker pytest tests/ with importlib mode and tests/integration excluded; structure check with pinned Python PATH. Every new high-risk behavior has a discriminating red/green or controlled fault case; missing-symbol failures alone are not semantic proof.
- [ ] 2.2 Three-seat expanded review: correctness, evidence/spec, invariant-state/path-safety. Preserve reports and raw evidence; real Docker remains epic19.0.

## Risk packs

- Public API / CLI / script entry — selected:1.2 broker API consumed by#16.
- Config / project setup — selected:1.4 positive bounded limits and shared configured root.
- File IO / path safety / overwrite — selected:1.2/1.4 index atomicity, no-follow traversal and failure preservation.
- Schema / columns / units / field names — selected:1.2/1.3 persisted ids/revisions/hash/tombstones and validation.
- Auth / permissions / secrets — not a new auth pack: reuse canonical chat validator; no endpoint/token changes; path confinement covered above.
- Concurrency / shared state / ordering — selected:1.2 existing thread+flock and real process contention.
- Resource limits / large input / discovery — selected:1.4 count/size/page/index bounds, streaming hashes and5000 unchanged files.
- Legacy compatibility / examples — selected:1.3 documented detection boundaries; HTTP compatibility stays#16.
- Error handling / rollback / partial outputs — selected:1.4 corruption, unstable read and failed replacement never silently reset identity.
- Release / packaging / dependency compatibility — selected:1.5 Dockerfile COPY; no dependencies or engine build in this issue.
- Documentation / migration notes — selected:1.1/1.5 user decisions and bounded storage/operator consequences.
