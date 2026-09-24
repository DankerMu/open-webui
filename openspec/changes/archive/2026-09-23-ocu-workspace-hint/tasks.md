# Tasks

## 1. Shared hook

- [x] 1.1 Approve expanded fixture and strict validation; shared-entrypoint risk override recorded in proposal.
- [x] 1.2 Add one best-effort completion hint in computer_use_tools.py:\_run_tool; real wrapper tests prove one event for success/error/exception and exact minimal payload without revision.
- [x] 1.3 Preserve absent/failing emitter, outer validation/header rejection and cancellation behavior; prove internal client health/auth rejection retains its configuration result/status and emits one hint. Targeted tests reach behavioral assertions and fail pre-change where behavior is new.
- [x] 1.4 Update existing README/changelog for hint-only authority and completion boundary; no handler or socket edits.

## 2. Acceptance

- [x] 2.1 Parent pinned non-Docker suite plus public-wrapper smoke; preserve raw semantic RED/GREEN evidence.
- [x] 2.2 Expanded correctness/integration and evidence/security review, bounded repair gate, CI/merge and fixture archive.

## Risk packs

Shared entrypoint/API:1.2 all public wrappers. Schema/auth/privacy:1.2 exact payload and injected server emitter. Async/error/partialfailure:1.3 exception/cancellation and best-effort outcomes. Compatibility:1.2–1.4 status and return unchanged. No fileIO, broker, resource policy, deployment or dependency change. Docker acceptance deferred#36.

## Evidence

OCU PR12 merged at b3a6185; reviewed head cf0a76f113184ce54071c68c4915c1541ae5f838. Parent pinned Python3.12 suite660 passed/5 skipped; actual public-wrapper smoke preserves smoke-ok and emits the exact hint. Two independent reviewers found no actionable defects; round1 clean. Initial semantic RED8failed/3passed demonstrates missing hint behavior; implementer47test GREEN used Python3.14, so compatibility evidence is the parent3.12 run. Logs and full review: https://github.com/DankerMu/open-computer-use/pull/12#issuecomment-5807200673. UI handler#32 and Docker/end-to-end#36 remain excluded.
