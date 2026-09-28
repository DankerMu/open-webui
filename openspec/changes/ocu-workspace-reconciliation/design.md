# Design

## Context

WorkspaceArtifact currently owns describe, coherent pagination, selection reconciliation and request generations, but it unmounts when closed. ChatControls consumes chat-keyed open/change latches. Chat.svelte's event handler filters active chat before looking up message_id. Describe now returns nested `prefs`; old top-level `view`/`selectedFileId` reads are not a wire contract. The pure recognizer permits path-only bases, so its browser caller must supply an absolute base.

## Goals / Non-Goals

Complete the missing producer and delegated link integration while preserving saving, native panels, trust policies, failure visibility and existing file tests. No duplicate poller/reconciler, backend change, new endpoint, dependency, OCU source change, model-context injection or implicit Launch. No Docker or host-network action before final acceptance.

## Decisions

### One controller, explicit ownership

A fork-owned `workspace-reconciliation.ts` controller follows the existing persistence-helper pattern. Chat owns its attach/detach; provide it to descendants with Svelte context, following the existing context convention rather than a global registry or prop plumbing through unrelated panels. Constructor is SSR-safe; browser listeners/timers start only on mount. Bind only enabled, non-embedded, saved, non-temporary/non-local/non-channel/non-default chats.

Move the component's coherent-page and data reconciliation implementation into this controller and delete the old copy atomically. WorkspaceArtifact reads chat-keyed data/phase and delegates Refresh/Retry/More/Launch; it retains DOM, selection affordances and Office ready/result deadlines. Component close destroys frames and preview timers, but does not cancel the active Chat producer needed for closed-panel change discovery. Chat switch/unmount/disable/temporary transition retires the producer, aborts owned requests and prevents stale store or preference effects.

### Hints and full polling

Disabled, embedded or temporary Chat instances do not consume workspace hints or create producer resources. Valid background saved-chat hints are retained only by the enabled non-embedded Chat owner.

Place hint recognition before both active-chat and message lookup gates. Validate the saved envelope chat identity and any payload identity agreement; mark that chat dirty only. Payload revision/files are never authoritative. Background chat hints issue no request. The producer consumes current-chat dirtiness and reconnect hints through the same scheduler, coalescing while a run is in flight and retaining a hint received during that run for a subsequent pass.

Use one self-rescheduling poll loop:3 seconds visible,15 seconds hidden; visibility change updates scheduling. Every cycle refreshes authorized describe/status/capabilities and, when files are available, a coherent proxied listing. Never call POST /refresh automatically. Preserve the broker's conditional GET/ETag short-circuit:304 is usable only with previously accepted matching data; pagination/uncached path resolution must not mistake304 for an empty list. No overlapping runs; generation checks cover every continuation. Errors retain known data and produce the existing honest state/notice instead of empty success. Ordinary polling is the only repeated retry mechanism.

Conditional requests explicitly send a stored ETag through the API client; `cache: no-store` does not supply implicit browser caching. The native stub mirrors this existing broker protocol so304 behavior is exercised, not merely defended against.

### Preference hydration and local intent

Read `prefs.view`, `prefs.selected_file_id`, `prefs.open`; remove speculative top-level readers. Hydrate once for a previously unhydrated chat, not on every poll. Returning to a cached chat preserves current close/acknowledgment/selection policy. A restored explicit `open:false` establishes the close latch; missing prefs retain the default first-output policy. Stopped/unavailable runtime view is presented as Files without implicitly launching.

All preference writers retain the existing per-chat ordered queue. The minimal ChatControls persistOpen hook sends only the user's open patch to the shared hydration-aware writer, instead of snapshotting default view/null selection before describe completes. Merge user patches over authoritative hydrated state and construct full PUT payloads at ordered execution time. Late describe cannot overwrite a newer local choice. Hydration failure must not write guessed defaults. Complete authorized enumeration may clear a missing selected identity once; partial/error/older listings cannot.

### Selection and preview lifecycle

Retain coherent revision windows,100-page bound, stale-cursor restart and selected-file protection while loading More. A lower revision never replaces accepted newer files. Compare selected preview identity by file_id plus path and revision, not object identity or mtime. Unchanged selected content and runtime views keep their iframe element across unrelated updates. Restore/changed Office selection arms one handshake; generated content reloads on path/revision change without sandbox widening. Manual and capability-forced returns to Files retain the shared Office transition behavior.

### Delegated preview links

One messages-container handler uses the existing recognizer with the validated same-origin absolute `/ocu` base. Only unmodified primary activation of a current-chat preview link is intercepted synchronously. Modified gestures, download links/query, the distinct archive-download endpoint, foreign origins, other chats and unrelated paths retain native behavior. No Markdown component is modified.

A recognized file path may be beyond the loaded window: open the Files surface and resolve it through the same bounded coherent enumeration before selecting a real file_id. Compare encoded canonical URLs, not guessed IDs or multiply decoded paths. Complete absence yields the existing missing-file notice/list, never an invented selection or automatic asynchronous popup. Successful explicit selection persists via the shared writer. Navigation during resolution cannot populate the new chat.

## Risks / Trade-offs

Extraction changes data ownership, so migrate all component test setup to provide the real controller while preserving behavioral assertions. Shared store generation must not be retired by consumer-only close. Preference hydration races require a delayed-describe/user-action test. Polling stopped state must not be confused with starting a sandbox. Chat.svelte's line ratchet remains binding: keep hook-sized changes and move only related fork coordination, not unrelated upstream code.

## Verification and Migration

Parent observes actual A-T11 missing-producer RED before implementation. Units inject clock/visibility and delayed API boundaries for3s/15s cadence, coalescing, stale generations,304, hydration races and pagination; actual browser cases use the existing authenticated server event route, not a browser-forged socket event or production test backdoor. Actual HTTP prefs and files survive an owned WebUI/backend and OCU-stub process restart; record restart identities and zero launch calls. This is native restart evidence, not real Docker sandbox restart; issue36 owns that final leg.

Keep A-T01 top-level isolation by exercising an explicit modified new-tab gesture after ordinary matching clicks become sidebar actions. Preserve all origin/token/relative-resource assertions and all existing Office/native controls cases. Required gates: frontend tests, typecheck, scoped lint, coverage, smoke/proxy, full verify-ui, docs/specs and independent expanded review. Existing two reconnaissance reports are evidence references, not authority over these decisions.
