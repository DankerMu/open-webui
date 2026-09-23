# ocu-lifecycle Specification

## Purpose

Keep per-chat sandbox lifecycle explicit and serialized across multiple OCU workers, with observed launch results, scoped credentials and pause-aware idle timing.

## Requirements

### Requirement: Cross-worker lifecycle serialization

OCU SHALL preserve multiple workers and serialize every get/create/start/stop/launch/describe transaction for one canonical chat through one stable process-local lock plus one shared-filesystem flock. Async handlers SHALL execute the transaction off the event loop. A create-name conflict SHALL adopt a running winner or fail explicitly, never delete it.

#### Scenario: Concurrent workers create one sandbox

- **WHEN** two worker processes receive first-use requests for the same chat
- **THEN** exactly one sandbox is created and both observe it without deleting either attempt

#### Scenario: Stable lock identity

- **WHEN** two threads request the lock for differently cased forms of one chat
- **THEN** both receive the same process-local lock object

### Requirement: Explicit resume and observed launch

Tool and MCP paths SHALL return a running sandbox or create one only when neither sandbox nor valid metadata exists. Every non-running state, including a non-running winner of a create conflict, and absent-with-valid-metadata SHALL return SandboxStopped without implicit start. Launch SHALL return200 only after observing running: running is idempotent; exited/created start; paused receives a fresh host idle window before unpause; restarting waits within a bounded deadline. An absent container with valid metadata SHALL recreate using server-side credential fallbacks only. A non-running create-conflict winner SHALL return explicit failure without deletion. Dead, timeout, engine refusal and corrupt metadata SHALL return explicit failure without deleting the sandbox or metadata. Internal launch/describe and restart/resurrect aliases SHALL enforce the internal token and canonical chat guard.

#### Scenario: Stopped tool call

- **WHEN** a tool or MCP request arrives for a stopped, paused, created or absent-with-metadata chat
- **THEN** it returns a workspace-stopped error and Docker state/metadata remain unchanged

#### Scenario: Launch failure preserves state

- **WHEN** launch encounters dead, engine refusal, restart timeout or corrupt metadata
- **THEN** it returns an explicit error and neither removes nor recreates the sandbox

#### Scenario: Never created

- **WHEN** launch is requested with neither sandbox nor metadata
- **THEN** it returns409 with literal `never_created` and creates nothing

#### Scenario: Recreate from metadata

- **WHEN** launch is requested for an absent sandbox with valid metadata
- **THEN** it recreates from server-side credential fallbacks and returns200 only after observing running

#### Scenario: Internal authorization refused

- **WHEN** internal launch or describe receives a missing or invalid internal token
- **THEN** authorization fails before Docker access or metadata mutation

#### Scenario: Repeated launch

- **WHEN** launch is repeated for a running sandbox
- **THEN** it returns running without restarting or recreating the sandbox

### Requirement: Non-mutating describe

Authorized describe SHALL return200 `{state, revision, views, cli_badge}` for every canonical chat without creating or changing a sandbox. State is running, stopped or never_created; revision is0 until the broker exists; views include browser/terminal only while running; cli_badge matches `/api/runtime/cli`.

#### Scenario: Running without terminal

- **WHEN** the sandbox is running but ttyd is inactive
- **THEN** describe returns running and does not start anything

#### Scenario: Absent or paused

- **WHEN** the sandbox is paused or absent with valid metadata
- **THEN** describe returns stopped and state remains unchanged

### Requirement: Pause-aware host idle reclamation

OCU SHALL own idle reclamation on the host while the service is online. External Docker pause/unpause SHALL exclude paused time. Tracking interruption or uncertain pause history SHALL defer automatic stop and establish a fresh idle window, never stop from stale timing evidence. OCU downtime SHALL suspend idle reclamation. Heartbeats and expiry decisions SHALL serialize through the shared lifecycle lock; expiry SHALL revalidate Docker state and activity before stopping. The detached in-container self-kill timer SHALL be removed.

#### Scenario: External pause exceeds idle timeout

- **WHEN** a sandbox is externally paused beyond the idle timeout and externally unpaused while OCU is online
- **THEN** elapsed paused time does not trigger an idle stop

#### Scenario: Tracking interruption

- **WHEN** pause tracking is interrupted or OCU restarts with uncertain idle history
- **THEN** reclamation grants a fresh idle window instead of stopping from an expired pre-interruption deadline

#### Scenario: Activity races expiry

- **WHEN** a heartbeat refresh completes before the serialized expiry decision
- **THEN** the sandbox is not stopped using the superseded idle state

#### Scenario: OCU unavailable

- **WHEN** OCU is down
- **THEN** no sandbox-side timer performs idle reclamation on its behalf

### Requirement: State-specific sleeper migration

Running pre-upgrade containers SHALL retire the detached sleeper synchronously before host reclamation adopts them. Exited/created containers SHALL require no retirement exec. A paused pre-upgrade container without verified migration evidence SHALL return migration-required on launch without unpause or deletion. Deployment SHALL require an explicit operator stop of that legacy paused container with the old orchestrator quiesced; subsequent explicit launch SHALL preserve the container and mounts. Successful migration evidence SHALL be bound to container identity. External pause/unpause guarantees apply after this deployment cutover.

#### Scenario: Paused legacy sandbox

- **WHEN** launch encounters a paused pre-upgrade sandbox without verified sleeper retirement
- **THEN** it reports migration-required without exec, unpause, delete or recreation

#### Scenario: Exited legacy sandbox

- **WHEN** explicit launch encounters an exited pre-upgrade sandbox
- **THEN** it may start the same container without requiring a retirement exec in the exited state

### Requirement: Scoped sandbox credentials

Creation SHALL read request-scoped credentials inside the locked transaction. Recreation from metadata SHALL read credentials only from server-side fallbacks, never from the launch request. Internal token and MCP_API_KEY SHALL never enter sandbox environment. NO_AUTOSTART=1 SHALL be present exactly when OCU_SANDBOX_NO_AUTOSTART=1.

#### Scenario: Concurrent chats

- **WHEN** two chats are created concurrently with different request credentials
- **THEN** each sandbox environment contains only its own credential and neither internal service secret
