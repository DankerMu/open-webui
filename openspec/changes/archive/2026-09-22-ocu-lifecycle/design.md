# Design

## Context

Current lifecycle implicitly starts non-running containers and uses destructive name-conflict recovery. Packaging runs multiple workers, so a process-local lock alone cannot serialize creation. The idle timer is an in-container sleep that resumes immediately after pause. Merged WebUI client requires literal409 never_created and structured describe fields.

## Governing Invariant

A sandbox resumes through explicit launch in OCU; external Docker operator pause/unpause remains supported. One lifecycle transaction per chat is serialized across workers; success is observed, never inferred, and launch failure deletes nothing.

## Decisions

- `get_chat_lock(chat_id)` returns the same process-local Lock for a canonical chat key. A per-chat flock on the shared control-plane data directory is acquired only after that lock and only inside worker-thread transactions. Async routes dispatch the entire transaction with `asyncio.to_thread`; no lock is held across await. #15 broker and later fence reuse this boundary.
- On create-name conflict, reload and adopt the winning container when it is running; otherwise the tool path raises SandboxStopped and launch returns an explicit failure. Remove force-delete recovery. Existing external stop/remove actors still cannot take the lock, so every transaction re-reads state after acquisition.
- Tool/MCP path returns a running container or creates only when both container and valid metadata are absent. Existing non-running states and absent-with-valid-metadata raise SandboxStopped. Corrupt metadata is an explicit error, not never-created or a new container.
- Launch matrix: running is no-op; exited/created start; paused establishes a fresh host idle window before unpause; restarting polls reload until running or bounded timeout; dead, engine refusal and timeout return explicit5xx without deletion (Docker may itself change state during a failed start). Absent valid metadata recreates from server-side credential fallbacks only. Absent metadata returns409 `never_created`. Restart/resurrect aliases use the same auth, lock and function. Answer200 only after observing running, with `{"state":"running"}`.
- Describe reads Docker state and metadata under the lock without mutation. Return200 `{state, revision:0 until broker #15, views, cli_badge}` for every authorized chat. cli_badge uses the existing `/api/runtime/cli` object. Views are files plus browser/terminal only while running.
- Internal routes use the existing auth guard and canonical chat rejection. Metadata writes are atomic temp-file rename; reads distinguish absent, valid and corrupt.
- Idle expiry is owned by the OCU host, not a sandbox sleeper or deadline watcher. While OCU is online, external Docker pause/unpause excludes paused time from idle expiry. Tracking interruption or uncertain pause history defers automatic stop and establishes a fresh idle window; it must not kill from stale timing evidence. While OCU is down, no idle reclamation runs. This availability boundary was explicitly selected by the user. Heartbeat updates, pause observation and automatic stop share the lifecycle lock and must revalidate state and activity before stopping. Remove the detached in-container sleeper; do not introduce a control mount just to publish deadlines.
- Credential reads occur inside the locked creation transaction from the originating request context or server fallback for metadata recreation. OCU_INTERNAL_TOKEN and MCP_API_KEY never enter sandbox env. NO_AUTOSTART=1 is present only when OCU_SANDBOX_NO_AUTOSTART=1.

## Evidence and Non-goals

Tests use a mocked Docker client for state/error rows and real app/auth for routes. Two separate Python processes prove one flock permits one creation; threads prove stable Lock identity. Timer tests cover external pause/unpause beyond timeout, tracking interruption, fresh activity racing expiry, and OCU restart without stale expiry. Semantic red must show current implicit restart/destructive conflict behavior, not import failure.
Non-goals: broker implementation, network detach, retention script, changing pre-existing60-second await cancellation, and Docker pause execution in this issue. Final Docker proof is epic task19.0. WebUI client/router/frontend error mapping is owned by [issue64](https://github.com/DankerMu/open-webui/issues/64), which must complete before epic acceptance36: no OCU launch failure may become WebUI HTTP200. Issue13 proves the direct OCU contract, not the consumer fix.
Rollback removes the new routes/aliases together with the lifecycle behavior; do not restore implicit start or destructive recovery independently.

## Deviations from parent design

- D6's process-local-only locking is superseded by thread lock plus cross-process flock; multiple workers remain supported.
- D7's unconditional success for existing non-running containers is superseded by observed running or explicit failure without deletion.
- The retention clause requiring a reset before pause is superseded by host-owned pause-aware idle accounting. OCU downtime suspends idle reclamation; uncertain tracking postpones expiry rather than guessing.
- The pre-implementation record, promoted with the completed control-plane contract, is `docs/decisions/implemented/architecture/2026-09-22-ocu-lifecycle-lock-and-launch-semantics.md`.

## Host idle controller

All workers use an atomic per-chat idle-state file and the combined lock; no worker-local activity counter is authoritative. Persist container identity, last observed status, last observation time and idle expiry. Heartbeats and tool entry extend expiry; command-specific timeout protection remains at least `max(idle_timeout, command_timeout + 60)`.

Lifespan-managed worker sweeps run off the event loop. Each check reloads both Docker state and shared idle state under the combined lock. Never stop paused containers. First observation, identity change, paused-to-running transition, missing/corrupt idle state or an observation gap beyond the polling allowance establishes a fresh window. A worker startup grants a fresh window before it may reap. Polling cadence must be shorter than idle timeout and invalid configuration fails loud. A running container is stopped only after a continuous observed running interval reaches expiry without refreshed activity. Short pauses between polls cannot consume an entire timeout; observations interrupted long enough to miss a timeout invalidate expiry. Conservative extra lifetime is permitted, premature expiry is not.

Existing-container cutover is state-specific. Exited/created containers have no live sleeper and require no retirement exec; launch may start them normally. For a running container, retire its detached sleeper synchronously under the existing in-container timer flock: terminate the sleeper child before its parent and remove the PID marker; verify completion before enabling host reclamation. A failed retirement returns an explicit migration error, never silent adoption.

A paused pre-upgrade container cannot execute retirement code. The deployment prerequisite is an explicit operator Docker stop of that container while the old orchestrator is quiesced; preserve the container and all mounts, verify stopped, then deploy and use explicit launch. No automatic unpause, delete or recreate is permitted for migration. Until that operator step is complete, launch of a legacy paused container returns an explicit migration-required error, not an impossible retirement attempt. Dead/restarting legacy containers retain the ordinary launch failure/readiness rules; retirement is attempted only after running is observed. Newly created or successfully migrated containers are marked with their container identity in host state, so future pause/unpause requires no migration step. Loss of that migration evidence fails conservatively rather than assuming a paused container is safe.

The pause guarantee applies after this deployment cutover. Deployment instructions and consolidated Docker acceptance must cover running retirement, exited adoption and operator-stop of a legacy paused container; an upgrade is not complete while legacy paused containers remain unprepared.
