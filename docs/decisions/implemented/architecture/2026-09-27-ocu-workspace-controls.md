---
id: 2026-09-27-ocu-workspace-controls
title: Workspace actions share authoritative chat persistence and chat-keyed panel policy
kind: architecture
status: implemented
date: 2026-09-27
supersedes: none
references: 2026-09-27-ocu-workspace-files-consumer, 2026-09-27-ocu-selected-runtime-embedding, DankerMu/open-webui#30
---

# Workspace actions share authoritative chat persistence and chat-keyed panel policy

## Problem

An unsaved chat has no execution identity. Workspace activation and first Send can race two server-side chat creators. A panel-local save guard cannot prevent a stale completion from adopting another chat's identity. Runtime views also need independent lifecycle ownership without recreating clients on message updates.

## Decision

Chat.svelte supplies the save callback and preserves the upstream persistence path through the fork-owned workspace-chat-persistence module. Workspace-first activation shares one pending save with Send. Send-first activation disables the workspace action until the completion API supplies an authoritative chat ID or fails. Epoch, history and temporary-mode guards prevent obsolete adoption. Pre-saving an empty chat preserves first-message title and tag generation. Draft state remains in Chat; no client-generated saved identity is accepted.

ChatControls owns the reachable, feature-gated workspace action and native-panel exclusion. Temporary, local, channel, default and embedded contexts cannot activate it. The chat-keyed OCU store owns open/view preferences, user-close and one-time auto-open latches, and acknowledged revisions independently of listing dirtiness. Accepted nonempty outputs may open once; explicit close prevents later accepted revisions from reopening. Background discovery, reconciliation and reload restoration belong to the separate Chat integration producer.

WorkspaceArtifact selects Files or a capability-gated Browser/Terminal mode on the validated current-chat preview URL. Runtime frames use the fixed trusted-application sandbox; generated document isolation remains separate. Switching away destroys the selected runtime frame, while ordinary same-chat updates preserve its element. Frame teardown retires client transports, not the sandbox process. Selected file identity survives runtime views and preference writes remain serialized per chat.

## Alternatives considered

- **Save inside ChatControls** — duplicates the authoritative save path and cannot guard upstream identity adoption.
- **Always await a resolved promise before Send** — introduces a microtask window before the synchronous first-send latch; the no-pending-save path remains synchronous.
- **A second polling loop for controls** — duplicates the upcoming event/history reconciler and splits accepted-state ownership.
- **Raw CDP/ttyd clients in WebUI** — duplicates the selected-mode OCU application and its transport teardown contract.

## Consequences

The upstream Chat seam contains only coordination and callback wiring; fork-owned persistence and policy have paired behavioral tests. The feature remains off by default. The native proxy harness proves actual app/client behavior with recording sockets, not real sandbox process execution. Docker, production networking and real runtime acceptance remain final deployment work.
