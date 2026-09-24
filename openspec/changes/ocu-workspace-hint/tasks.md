# Tasks

## 1. Shared hook

- [ ] 1.1 Approve expanded fixture and strict validation; shared-entrypoint risk override recorded in proposal.
- [ ] 1.2 Add one best-effort completion hint in computer_use_tools.py:_run_tool; real wrapper tests prove one event for success/error/exception and exact minimal payload without revision.
- [ ] 1.3 Preserve absent/failing emitter, outer validation/header rejection and cancellation behavior; prove internal client health/auth rejection retains its configuration result/status and emits one hint. Targeted tests reach behavioral assertions and fail pre-change where behavior is new.
- [ ] 1.4 Update existing README/changelog for hint-only authority and completion boundary; no handler or socket edits.

## 2. Acceptance

- [ ] 2.1 Parent pinned non-Docker suite plus public-wrapper smoke; preserve raw semantic RED/GREEN evidence.
- [ ] 2.2 Expanded correctness/integration and evidence/security review, bounded repair gate, CI/merge and fixture archive.

## Risk packs

Shared entrypoint/API:1.2 all public wrappers. Schema/auth/privacy:1.2 exact payload and injected server emitter. Async/error/partialfailure:1.3 exception/cancellation and best-effort outcomes. Compatibility:1.2–1.4 status and return unchanged. No fileIO, broker, resource policy, deployment or dependency change. Docker acceptance deferred#36.
