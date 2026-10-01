# Tasks

## 1. Consistent full backup

- [x] 1.1 Implement attributed resource discovery and cold maintenance quiescence; prove running/paused/unstoppable and ambiguous writers prevent capture, unknown fake operations fail, unrelated resources stay unchanged and no sandbox resumes automatically.
- [x] 1.2 Capture the complete database/files/workspace/config/release set with private exclusive publication; prove detached workspace coverage, exact checksums/membership, modes and initializer marker, and interrupted or incomplete capture cannot publish success.

## 2. Isolated restore

- [x] 2.1 Implement complete artifact validation and confined metadata-preserving extraction; prove corrupt/missing/mixed members, traversal/link escape, duplicate paths and unsupported types reject before destination data mutation; supported links/permissions round-trip.
- [x] 2.2 Restore to a distinct empty daemon/root with protected config and separately supplied provider credential file; prove source-daemon/occupied-resource/socket-mismatch refusal, pinned helper/startup identity, literal-value preservation, restored persistent-provider precedence, no secret output, no implicit deletion, and partial failure blocks reuse/readiness.
- [x] 2.3 Restore database state and prune only orphan workspace rows; prove surviving owners/preferences/cursors/file IDs/revisions remain intact, cursor skew rejects, and the initialization marker prevents reseeding.

## 3. Previous release activation

- [x] 3.1 Validate retained-release source/image/schema/database compatibility and activate its own checked startup; prove incompatible revisions/tools reject, additive schema survives, frozen no-build/no-pull and proxy-only preflight remain enforced, and recovered workspaces require explicit launch.
- [x] 3.2 Deliver the cold-backup/restore/rollback checklist, failure recovery procedure and operator cutover contract; verify command examples against the CLI and documentation gates, without editing user-owned local sketches.

## 4. Source integration

- [x] 4.1 Parent runs focused and deployment regression tests, protected counterexamples and restoration checks; independent high-risk cross-review and exact-head source CI pass; record source-only merge and decision/docs synchronization without closing issue34.

## 5. Final engine acceptance

- [ ] 5.1 After all source development, use a dedicated empty host/daemon to execute complete backup/restore and compatible previous-release startup; attach A-T14/A-T15 output/screenshots proving outputs, revisions, ownership, permissions, stopped-launch behavior, no WAN/build/pull and proxy-only exposure, then close issue34 and archive this fixture.

## Risk and evidence mapping

Resource state/order/concurrency: 1.1,1.2,2.2. Filesystem/archive/permissions: 1.2,2.1. Secret/config boundary: 2.2. Database invariants/rollback compatibility: 2.3,3.1. Operational contract/docs: 3.2. Independent source assurance: 4.1. Actual engine and user-visible recovery: 5.1.

Construction mode, critical data-integrity and operating boundary. Parent owns fixtures, protected expected invariants, executable acceptance and Git/PR work; implementer owns source/tests and skips all validation during its pass. Docker-free tests use real Git/filesystem/archive/subprocess operations with explicit stateful engine/database fakes. Qualify major guards using observable wrong resource/data states, not command echo or source-string checks. No real Docker CLI/config/engine or host firewall/network operations before5.1. Fake evidence cannot satisfy5.1.
