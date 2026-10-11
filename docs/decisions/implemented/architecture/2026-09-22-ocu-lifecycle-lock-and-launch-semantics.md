---
id: 2026-09-22-ocu-lifecycle-lock-and-launch-semantics
title: Multi-worker lifecycle serialization and host-owned idle reclamation
kind: architecture
status: implemented
date: 2026-09-22
supersedes: none
references: 'Plan 1; issue #13; ocu-workspace-integration D6/D7; ocu-lifecycle'
---

# Multi-worker lifecycle serialization and host-owned idle reclamation

## Problem

A process-local lock cannot serialize multiple OCU workers. An in-container sleeping self-kill timer can fire immediately after a long pause. Reporting successful launch without observing running hides Docker failures.

## Decision

Preserve multiple workers. Acquire a canonical per-chat threading RLock followed by a shared-filesystem flock; lifecycle transactions execute off the event loop. Reentrancy permits existing synchronous helpers to nest inside the transaction without reacquiring a conflicting file description. Broker and fence reuse the same boundary. This amends parent D6's process-local-only lock scope.

Create-capable outer acquisition pins the configured data root, creates the canonical chat entry relative to it and synchronizes that parent before lock admission. An existing entry is synchronized too; existence does not establish that an earlier creator completed its durability barrier. Parent-sync failure releases owned descriptors and the thread lock without admitting the operation or setting flock depth. Nested acquisition reuses the admitted transaction; non-creating acquisition remains non-creating and does not add synchronization. Configured data-root symlinks remain supported, while chat entries are opened without following symlinks. Durability of the configured root's own ancestors is outside this boundary.

Launch succeeds only after observing running. Dead states, readiness timeout and engine refusal fail explicitly without container deletion. Creation conflicts adopt a running winner, never remove it. This amends parent D7's unconditional success for existing non-running states.

Idle reclamation runs on the OCU host. External Docker pause/unpause is supported while OCU is online. Uncertain pause history or tracking interruption grants a fresh idle window instead of stopping from stale timing evidence. No idle reclamation runs during OCU downtime. Remove the in-container self-kill timer; the parent reset-before-pause rule is not the mechanism for this guarantee.

## Alternatives considered

- **Single worker** — rejected by the user; multi-worker support is required.
- **In-container deadline watcher refreshed before launch** — cannot protect external unpause or satisfy suspended reclamation during OCU downtime.
- **Periodic deadline refresh while paused** — observation gaps do not establish an unconditional pause guarantee.
- **Independent always-on idle controller** — user chose online-only OCU reclamation, avoiding another deployed service.
- **Delete and recreate dead containers** — rejected by the user; launch failure preserves the container.

## Consequences

Tracking uncertainty favors sandbox availability over exact idle expiry. Runtime evidence must cover external pause/unpause, observer interruption, fresh activity racing expiry and multiple workers. Docker evidence remains part of the consolidated epic acceptance.

Directory synchronization adds IO to create-capable outer acquisitions. Real-directory fault injection verifies inode selection, ordering and refusal before admission; it does not simulate host power loss or certify deployment filesystem durability.

Existing sleeper-equipped containers require a state-specific cutover: running containers retire the sleeper synchronously with verified completion; exited/created containers have no live sleeper; legacy paused containers require an operator stop with the old orchestrator quiesced before explicit launch. No deletion or automatic resume is permitted for migration. WebUI failure mapping is specified by `2026-09-27-ocu-consumer-failures`. Launch lookup refusal remains a structured500 `launch_failed` without engine mutation; retirement refusal remains409 `migration_required` for running and restarting-after-ready callers. Real-Docker acceptance remains deferred to the consolidated epic gate.
