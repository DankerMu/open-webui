# Proposal

## Why

Independent database and directory copies cannot recover one workspace state while sandbox and application writers remain active. The release inventory establishes image identity but does not recover persistent data or prove compatibility with a previous release.

## What Changes

- Add a tracked cold-backup and empty-target recovery procedure in the OCU deploy seam, including sandbox workspace volumes and orphan `ocu_chat_state` pruning in the restored database.
- Bind one complete recovery set to its release inventory, captured configuration, database and filesystem components; reject unsafe, incomplete or mixed sets before restore mutation.
- Require maintenance-window quiescence and a distinct empty local daemon/host for restore. Never delete existing sandboxes, overwrite a live deployment or automatically resume execution.
- Activate a compatible previous release through its own verified startup path, retaining additive schema and proxy-only authorization/network policy.
- Keep actual A-T14/A-T15 execution mandatory in final issue36; source evidence does not close issue34.

## Capabilities

### New Capabilities

- `ocu-backup-rollback`: consistent recovery sets, isolated restore and compatible one-version release rollback.

### Modified Capabilities

None. Existing release identity, bootstrap no-overwrite and explicit sandbox launch contracts remain authoritative.

## Impact

OCU deploy recovery module(s), existing release/startup integration where necessary, deployment documentation and stateful fake boundary tests. WebUI owns this fixture and the decision record; no upstream application or schema changes. No dependency upgrade or external backup service.

Expanded fixture: state/ordering, filesystem/archive safety, database/release compatibility, secrets/permissions, concurrency/cancellation and operational evidence risk packs. One atomic recovery procedure is justified beyond the nominal small-PR width; avoid a new generic deployment framework.

User selected full cold backup and independent empty-target restore. Untracked OCU backup/restore sketches remain untouched. Real Docker CLI/config/engine and host network/firewall operations remain forbidden during source development.
