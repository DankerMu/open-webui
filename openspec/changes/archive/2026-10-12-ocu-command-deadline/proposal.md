# Proposal

## Why

DocumentServer commands can finish with `unreachable` while their synchronous callers remain in per-call event-loop shutdown waiting for DNS. Locked lookup callers then retain the canonical chat lock beyond the command budget.

## Triage

- Issue type: bugfix.
- Fixture level: expanded.
- Upstream suggested level: absent; concurrency, service execution ownership and persisted session transitions require expanded coverage.
- Blast radius: command execution in join/reopen, close, save and the Office session sweep, plus history restore's shared reopen-lookup consumer.
- Selected risk packs: public entrypoints; concurrency/shared state/ordering; resource limits; error handling; compatibility; request-context isolation; packaging of the new module; documentation.
- Evidence floor: command-specific semantic RED, unchanged-budget held-resolver acceptance for both command kinds and the four mandated callers, lock/state conservation, one-worker DNS compatibility including restore, induced-callback progress, save-worker startup/teardown/context/cancellation proofs, existing command/callback regressions, real HTTP runtime proof and scoped gates.

## What Changes

- Submit application command coroutines to the existing running request/reaper loop and bound the synchronous wait by the existing command budget.
- Remove all four production per-command `asyncio.run` sites; carry the actual loop explicitly through worker-owned session and sweep operations.
- Keep blocking lookup waiters outside the DNS executor. Give full synchronous save transactions a lifespan-owned standard executor separate from both DNS and callback admission, preserving queued/running cancellation and request context.
- Preserve asynchronous command protocol APIs, outcomes, request validation, state transitions, lookup locks and lock-free forcesave.

## Capabilities

### New Capabilities

- `ocu-command-deadline`: synchronous DocumentServer command completion and caller lock ownership across resolver delay. The callback-download evidence capability remains unchanged and owns a different boundary.

### Modified Capabilities

None.

## Impact

OCU `office/commands.py`, `office/sessions.py`, `office/sweep.py`, `office/restore.py`, a paired-tested `office/save_workers.py` lifetime owner, and the Office tick/lifespan in `app.py`, plus affected tests and documentation. Restore's `restore_version` → `_restore_version` → `_reopen_session` chain participates in the same loop/worker migration without changing restore admission or publication semantics. Central fixture, architecture decision and durable evidence. No new production event loop, dependency, timeout value, capacity setting, periodic scheduler or callback/downloader implementation change. The save owner adds a lazy standard-sized executor and one idle shutdown supervisor per lifespan. Authority: [issue 259](https://github.com/DankerMu/open-webui/issues/259).
