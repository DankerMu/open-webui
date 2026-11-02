---
id: 2026-11-02-ocu-sandbox-wake-retention
title: Stopped sandboxes wake on use, are retained 30 days, and are deleted with their chat
kind: architecture
status: implemented
date: 2026-11-02
supersedes: 2026-09-22-ocu-lifecycle-lock-and-launch-semantics (explicit resume of stopped sandboxes only)
references: DankerMu/open-webui#697, DankerMu/open-webui#698, DankerMu/open-webui#699, DankerMu/open-computer-use#200, ocu-sandbox-wake-retention, ocu-lifecycle, webui-chat-sandbox-cleanup, 2026-09-26-ocu-sandbox-dns, 2026-09-26-ocu-private-runtime-provisioning
---

# Stopped sandboxes wake on use, are retained 30 days, and are deleted with their chat

## Problem

A message in a chat whose sandbox idle reclamation had stopped ended in `workspace is stopped and needs an explicit launch`; users read it as "sandbox unavailable" and had to find the sidebar's Launch button. Nothing ever removed a sandbox: neither the idle reaper nor the runtime guard deletes, and upstream `cleanup` stays disabled in the deployment, so containers and `chat-<id>-workspace` volumes accumulated without bound. Deleting a chat in WebUI left its container, volume and `/data/<chat_id>` on the host.

## Decision

**Wake on use.** A tool or MCP request for a recoverable non-running sandbox runs the explicit-launch transaction inside the lifecycle lock it already holds, then continues: exited or created starts, paused unpauses, restarting waits within the readiness bound, and an absent container with valid metadata is recreated from server-side credentials. Dead, engine refusal, readiness timeout, legacy paused without migration evidence, a non-running create-conflict winner and corrupt metadata still fail with their explicit error class and delete nothing. Every launch that reaches running starts a fresh idle window. Terminal, the outputs broker and Office do not wake; describe stays non-mutating.

**Admin wake is accepted.** Completion lets an admin continue another user's chat, so an admin's message can wake or recreate the owner's sandbox, using the owner's server-side credentials. Explicit Launch stays owner-only, and shared-chat viewers and other non-owners are refused before any tool call. An admin's tool calls already run in the owner's sandbox while it runs; wake removes only the stopped-state difference.

**Idle default.** The packaged `CONTAINER_IDLE_TIMEOUT` is 3 days (259200 s). The 168-hour runtime guard still caps continuous runtime.

**Retention.** The host idle reaper removes a sandbox container that has been exited or created for at least `SANDBOX_RETENTION_DAYS` (a positive integer, 30 when unset; any other value refuses startup), aged from the engine's stop time, or its creation time when it never stopped. Under the per-chat lock it revalidates the container, persists `retained_at`, removes the container without force, then removes the chat's workspace volume. A later tick completes a volume removal that a crash interrupted. Retention keeps `/data/<chat_id>`, which holds the workspace files and metadata, so the next message in that chat recreates the sandbox through wake on use and finds its files. Running, paused, restarting and dead containers are never removed by retention.

**Delete and tombstone.** OCU's internal-token `DELETE /internal/sandbox/{chat_id}` accepts only a canonical chat id. Under the lifecycle lock it force-removes the container, removes the workspace volume, writes a `.deleted` tombstone with a directory fsync, also for a chat OCU never saw, and then removes every chat-directory entry except `.lifecycle.lock` and the tombstone. Writing the tombstone before the files means a failed file removal still refuses every later creator. Every later create-capable lifecycle acquisition for that chat, checked after the flock is held, refuses with 410 `chat_deleted`, so a tool call queued behind the delete cannot recreate it. The lock file is never unlinked. The call is idempotent and returns which of container, volume and files it removed; engine or filesystem failures return 500 `delete_failed` and are safe to retry. A busy MCP resource discovery at the end is tolerated, because the data is already gone. The route is not exposed through the WebUI proxy.

**Deletion policy.** Chat deletion removes the container, the volume and the files; retention removes only the container and the volume. Every WebUI chat-deletion path (single delete with its internal child chats, delete all, folder delete with its chats, and user deletion) passes the ids whose own database delete reported success to `utils/ocu_sandbox_cleanup.schedule_sandbox_cleanup`. The bulk paths go through `delete_user_chats` in the same module: it reads the ids with the delete's own filter, runs the self-committing delete, and schedules them as soon as it reports success, so a later failure in the caller cannot skip cleanup. Scheduling is a no-op when `ENABLE_OCU_WORKSPACE` is off. Otherwise it issues the OCU deletes in one background task, four at a time, held by a strong reference until done. A failure is logged with the chat id and never a credential, and it never delays, fails or alters the chat deletion.

The explicit-resume rule of [lifecycle serialization and launch semantics](2026-09-22-ocu-lifecycle-lock-and-launch-semantics.md) is superseded: a tool call wakes a stopped workspace without an explicit launch. Its lock, observed-launch, failure-mapping and no-deletion-on-launch-failure rules stay in force, and wake on use runs through them. Wake on use also reverses the "implicit restart after retention" alternative that [private runtime provisioning](2026-09-26-ocu-private-runtime-provisioning.md) rejected: that record's runtime guard still only stops sandboxes, and the next tool call now restarts them.

## Alternatives considered

- **Keep explicit resume and improve the error text** — users still stop and hunt for a button for a state they did not cause; the owner chose wake.
- **Wake from describe or the sidebar** — describe would mutate on every sidebar poll, and a sidebar wake still leaves a message sent first to fail.
- **Retention deletes the chat files too** — a user returning after 30 days would lose the workspace; the owner chose to keep files and recreate the sandbox.
- **Upstream `cleanup` or a time-based volume prune** — neither knows the chat lifecycle or the per-chat lock, and a prune can remove a volume a wake is about to remount.
- **Unlink the lock file on delete** — a waiter on the old inode and a new acquirer on a fresh inode would run concurrently, breaking cross-worker serialization.
- **No tombstone; rely on task cancellation** — only the single-delete path cancels tasks, and an in-flight tool call would recreate the deleted sandbox.
- **Synchronous or transactional OCU delete inside WebUI chat deletion** — an unreachable OCU, or an older OCU without the route, would block or fail chat deletion; best effort with logging was chosen.
- **Hooks import the workspace router for its flag** — model-layer code would depend on a router; the cleanup seam reads the environment itself with the router's parse.

## Consequences

- A sandbox woken before an interrupted retention retry remounts its old home; a fresh home is guaranteed only once volume removal succeeds.
- A created container that never started and has no chat metadata is not visited by retention. Orphan volumes from earlier redeployments carry no `retained_at` and stay for manual cleanup.
- Every deleted chat leaves a directory holding only `.lifecycle.lock` and `.deleted`, a few hundred bytes each. An in-flight Office lookup may leave `.office-lookup.lock` beside them before it is refused. `mcp_resources` entries in other OCU workers live until those workers restart.
- A WebUI chat deleted while OCU is down keeps its sandbox; there is no retry queue. Chats created between the id query and the bulk delete are deleted without cleanup. Both are logged or bounded, and retention reclaims the container and volume but not the files.
- WebUI evidence uses TestClient against the harness DB with the OCU client replaced at the network boundary, plus a proxy deny case in `make smoke-proxy`; it is not a real-engine certification. Real-Docker wake, retention and delete acceptance runs separately against the OCU image.
