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

Every outer acquisition, including `create=False`, pins the trusted configured data root and opens the canonical chat directory relative to it without following symlinks. The lock leaf is opened relative to that pinned directory with no-follow and nonblocking acquisition, then verified regular before flock. Open an existing leaf first; if absent, create exclusively; a concurrent creation winner is opened once without following symlinks. This preserves cross-worker first creation without a retry loop. Office sweep and sandbox reap share this owner; a prior pathname check cannot authorize admission.

Create-capable acquisition creates the chat entry relative to the held parent and synchronizes that parent before admission, including existing entries. Failure retires owned acquisition descriptors and releases the thread lock without publishing flock depth; directory-close failures remain visible on otherwise-successful or missing-chat returns. Nested acquisition reuses admission without reopening or syncing. Non-creating acquisition adds no sync and never creates an absent chat, but can create a missing lock in an existing chat. Configured data-root symlinks remain supported. Durability of the configured root's ancestors is outside this boundary.

Outermost release clears retained handle ownership before explicit unlock and attempts close through the file context even if unlock fails. It removes completed depth and releases the process-local lock; nested release preserves outer ownership. Unlock and close errors remain visible; if both fail, the close error carries the unlock error as context. Do not retry an uncertain close or assume a failed close retired the descriptor.

Launch succeeds only after observing running. Dead states, readiness timeout and engine refusal fail explicitly without container deletion. Creation conflicts adopt a running winner, never remove it. This amends parent D7's unconditional success for existing non-running states.

Use one private Docker-only adapter at request get/create, describe and initial launch lookup, the four launch preparation calls, and restarting readiness. Docker failures become status500 `launch_failed` with operation context and the original exception as cause. Lookup retains `engine lookup failed: ...`; MCP tools use their lifecycle error text and HTTP retains the nested `detail.detail`/`detail.reason` envelope. Maintenance, publish and reaper lookups keep the raw helper.

Only `containers.get` NotFound establishes absence; reload NotFound remains a failure. Specific network NotFound/APIError mappings, live-incompatibility409, readiness timeout504 and retirement409 `migration_required` remain distinct. Paused migration admission and action order are unchanged; retirement stays outside readiness translation. Creation, post-start verification and post-unpause reload are outside this adapter's scope.

Idle reclamation runs on the OCU host. External Docker pause/unpause is supported while OCU is online. Uncertain pause history or tracking interruption grants a fresh idle window instead of stopping from stale timing evidence. No idle reclamation runs during OCU downtime. Remove the in-container self-kill timer; the parent reset-before-pause rule is not the mechanism for this guarantee.

## Alternatives considered

- **Single worker** — rejected by the user; multi-worker support is required.
- **In-container deadline watcher refreshed before launch** — cannot protect external unpause or satisfy suspended reclamation during OCU downtime.
- **Periodic deadline refresh while paused** — observation gaps do not establish an unconditional pause guarantee.
- **Independent always-on idle controller** — user chose online-only OCU reclamation, avoiding another deployed service.
- **Delete and recreate dead containers** — rejected by the user; launch failure preserves the container.
- **Translate inside the raw lookup helper or at a broad lifecycle catch** — would change unrelated callers or absorb failures outside the named request operations.
- **Reuse post-start verification as a failure wrapper** — its rollback-stop behavior belongs to startup verification, not lookup, preparation or readiness.

## Consequences

Tracking uncertainty favors sandbox availability over exact idle expiry. Runtime evidence must cover external pause/unpause, observer interruption, fresh activity racing expiry and multiple workers. Docker evidence remains part of the consolidated epic acceptance.

Directory synchronization adds IO to create-capable outer acquisitions. Real-directory fault injection verifies inode selection, ordering and refusal before admission; it does not simulate host power loss or certify deployment filesystem durability.

The replacement threat requires host-side write access to the chat control directory, not remote or sandbox access. Descriptor-relative no-follow admission does not prevent hard links, arbitrary regular-inode replacement or trusted data-root configuration retargeting. Release fault injection covers close errors raised after actual descriptor retirement; it does not establish kernel retirement when close fails before retiring the descriptor.

Existing sleeper-equipped containers require a state-specific cutover: running containers retire the sleeper synchronously with verified completion; exited/created containers have no live sleeper; legacy paused containers require an operator stop with the old orchestrator quiesced before explicit launch. No deletion or automatic resume is permitted for migration. WebUI failure mapping is specified by `2026-09-27-ocu-consumer-failures`. Retirement refusal remains409 `migration_required` for running and restarting-after-ready callers. Real-Docker acceptance remains deferred to the consolidated epic gate.

A preparation failure stops later launch actions but preserves any network disconnect/connect effects already completed; preparation is not atomic and adds no rollback or retry. Lookup failure does not authorize replacement creation.

Injected-engine service and consumer probes establish the named error mappings and action boundaries. A real Docker SDK missing-socket probe exercises local connection failure, not a failure from a live engine; neither substitutes for live-Docker acceptance.
