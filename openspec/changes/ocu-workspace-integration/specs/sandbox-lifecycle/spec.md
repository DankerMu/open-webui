# Spec Delta

## Purpose

Container start/stop semantics in OCU: one per-chat lock, explicit launch as the only resume path with a defined state matrix, no implicit restart by tools for any non-running state, scoped credentials, retention that stops but never deletes. Source: Plan 1 § 1 停止语义; design D6, D7, D13.

## ADDED Requirements

### Requirement: Per-chat lock

OCU SHALL serialise container get/create/start/stop/launch for a chat_id through one `threading.Lock` keyed by chat_id, obtained from a module-level registry guarded by a single lock; the same lock object SHALL be exposed for Plan 2's commit fence.

#### Scenario: Concurrent first use

- **WHEN** two tool calls for chat C arrive concurrently on a chat with no container
- **THEN** exactly one container `owui-chat-C` is created and both calls use it

#### Scenario: Lock identity is stable

- **WHEN** `get_chat_lock("C")` is called twice from different threads
- **THEN** both calls return the same lock object

### Requirement: Non-running containers are never started implicitly

`_get_or_create_container` SHALL return a running container, or create a new one for a chat that never had one (no container and no `.meta.json`), and SHALL raise `SandboxStopped` for an existing container in any Docker state other than `running` (`exited`, `paused`, `created`, `restarting`, `dead`) and for a chat whose container is absent while its `.meta.json` survives; the `else: container.start()` branch SHALL be removed; no tool call, including read-only `view`, and no MCP request SHALL start a non-running container (A-T15).

#### Scenario: Tool call after retention stop (A-T15)

- **WHEN** the retention guard has stopped `owui-chat-C` and the model calls `view` or `bash` for chat C
- **THEN** the tool returns an error stating the workspace is stopped and needs an explicit launch, and the container remains stopped

#### Scenario: Paused or created container

- **WHEN** the container is `paused` or `created` and a tool call arrives
- **THEN** `SandboxStopped` is raised and the container state is unchanged

#### Scenario: Container removed by cron, meta kept

- **WHEN** `owui-chat-C` was removed but `BASE_DATA_DIR/C/.meta.json` exists, and a tool call for C arrives
- **THEN** `SandboxStopped` is raised and no container is created; only launch recreates it from meta

#### Scenario: MCP request after stop

- **WHEN** an MCP request for chat C arrives after the stop
- **THEN** the same `SandboxStopped` error is returned; the `retention/stop-overage.sh` comment claiming restart on MCP is removed

### Requirement: Launch state matrix

OCU SHALL expose an internal, token-protected `POST /internal/launch/{chat_id}` executed under the per-chat lock with this behaviour: running → no-op 200; any other existing state → start (unpause for `paused`) 200; absent with `.meta.json` → recreate from meta with secrets taken from server-side fallbacks in `_create_container`, never from the launch request, 200; absent without meta → 409 `never_created` and nothing is created. `/terminal/{chat_id}/restart-container` and `resurrect-container` SHALL call the same function with the same authorization, and the resurrect `409 "Container already exists"` SHALL be removed.

#### Scenario: Launch is idempotent

- **WHEN** launch is called twice for a running container
- **THEN** the second call returns the running state without restarting the container

#### Scenario: Recreate from meta

- **WHEN** the container was removed by cron, `.meta.json` exists, and launch is called
- **THEN** a container is recreated with identity from meta and credentials from server-side fallbacks, and the response is 200 `running`

#### Scenario: Never created

- **WHEN** launch is called for a chat with neither container nor meta
- **THEN** the response is 409 `never_created`

#### Scenario: Restart alias

- **WHEN** the SPA calls `/terminal/{chat_id}/restart-container` or `resurrect-container`
- **THEN** the effect is identical to launch and it is refused when the token or ownership check fails

### Requirement: Internal describe endpoint

OCU SHALL expose a token-protected `GET /internal/describe/{chat_id}` that reads Docker state and `.meta.json` presence under the per-chat lock and returns `{state, revision, views, cli_badge}`: `state` is `running` (Docker `running`), `stopped` (any other existing state, or absent with meta) or `never_created` (no container, no meta); `revision` is the outputs broker's current counter (0 before the first reconcile); `views` is `["files"]` plus `browser` and `terminal` when running; `cli_badge` is the value `/api/runtime/cli` computes today. It SHALL never create, start or unpause a container (design D7).

#### Scenario: Running without ttyd

- **WHEN** the container is running but ttyd has not been started
- **THEN** describe returns `running`, unlike `/terminal/{chat_id}/status` which reports `active: false`

#### Scenario: Paused and absent-with-meta read as stopped

- **WHEN** the container is `paused`, or was removed while `.meta.json` survives
- **THEN** describe returns `stopped` and the container state is unchanged

#### Scenario: Never created

- **WHEN** neither a container nor `.meta.json` exists
- **THEN** describe returns `never_created` and nothing is created

### Requirement: Sandbox terminal autostart is controlled by the server

`_create_container` SHALL place `NO_AUTOSTART=1` in the sandbox environment when `OCU_SANDBOX_NO_AUTOSTART=1` is set for the OCU process (the sandbox image's `.bashrc` already honours `NO_AUTOSTART`); the deploy overlay SHALL set that variable and SHALL NOT patch image sources for this purpose.

#### Scenario: Terminal starts bash

- **WHEN** a container is created or recreated with `OCU_SANDBOX_NO_AUTOSTART=1`
- **THEN** `docker inspect` shows `NO_AUTOSTART=1` in its environment and a new terminal session's foreground process is `bash`

#### Scenario: Variable unset keeps baseline

- **WHEN** `OCU_SANDBOX_NO_AUTOSTART` is unset
- **THEN** the sandbox environment has no `NO_AUTOSTART` entry and the image's baseline autostart applies

### Requirement: Credentials are scoped to the owning chat

Credentials placed in a sandbox environment (`GITLAB_TOKEN`, `ANTHROPIC_*`, sub-agent CLI keys) SHALL come only from the request-scoped context of the tool call creating that chat's container, read under that chat's lock; the internal proxy token and `MCP_API_KEY` SHALL never be placed in a sandbox environment (design D13).

#### Scenario: Concurrent creation does not cross

- **WHEN** chats A and B create containers concurrently with different `GITLAB_TOKEN` values in their contexts
- **THEN** each container's environment holds only its own chat's token

#### Scenario: Proxy token never in sandbox

- **WHEN** any container is created or recreated
- **THEN** `docker inspect` shows neither `OCU_INTERNAL_TOKEN` nor `MCP_API_KEY` in its environment

### Requirement: Retention stops but keeps data

After 168 h of continuous running the retention guard SHALL stop the container only; the volume `chat-{chat_id}-workspace` and host directories `BASE_DATA_DIR/{chat_id}/{uploads,outputs}` SHALL be kept; the self-kill timer SHALL be reset before any pause so a paused container does not die on resume.

#### Scenario: 168 h reached (A-T15)

- **WHEN** a container has run 168 h
- **THEN** it is stopped, the volume and directories still exist, files are still readable through the gateway, and the description reports `stopped`

#### Scenario: Pause does not kill

- **WHEN** a container is paused and resumed after longer than its idle timeout
- **THEN** it is still running after resume because the timer was reset before pausing
