---
id: 2026-10-04-ocu-office-client-store
title: Office parent client uses a fixed gateway, literal reasons, and a per-chat editor store
kind: architecture
status: implemented
date: 2026-10-04
supersedes: none
references: Plan 2 D15 D16; issue 152; issue 156; 2026-09-27-ocu-consumer-failures; 2026-09-27-ocu-workspace-files-consumer
---

# Office parent client uses a fixed gateway, literal reasons, and a per-chat editor store

## Problem

The parent page needs four Office gateway operations, current-frame authority and a chat-keyed editor snapshot for frame, status-bar and close-guard consumers. WebUI workspace-route error mapping folds 404 and allow-lists reasons. Broker session status never includes the host-only creation refusal. Office must not reuse `artifactContents` or a global active-chat pointer.

## Decision

The parent client lives in `src/lib/apis/ocu/office.ts` and accepts only `baseUrl === '/ocu'`. Other bases fail as `0/invalid_response` before fetch. Path segments are encoded. Requests use same-origin cookies and `cache: 'no-store'`. Restore and resolve send `X-Requested-With: ocu-workspace`. Session create, save and close stay on the editor host.

Failures reuse `WorkspaceRequestError` without changing workspace mapping. Broker string `reason` values pass through with the HTTP status, including 404 and empty strings. Transport failure is `0/request_failed`. Missing, unreadable or non-string reasons are `HTTP status/request_failed`. Non-JSON success bodies are `HTTP status/invalid_response`. There is no allow-list, retry or schema validator.

Editor state lives in `src/lib/stores/ocu-office.ts` (`ocuOffice`), keyed by chat. `OcuOfficeState.state` is `OfficeSessionState | 'refused'`. Broker HTTP types keep the eight persisted session states and do not gain `refused`. Optional `sessionId` represents host `session_id: null` by absence; `applyOfficeState` clears it only when the update supplies `undefined`. Generation begin, retire and apply stay per chat: a retired or absent generation changes nothing, and work on chat A keeps chat B's object identity.

`WorkspaceArtifact` offers the existing `Edit` action in the selected-file bar only for a saved chat with both workspace and Office features literally true and broker type docx/xlsx/pptx. Current broker type gates that fresh Edit only. An admitted activation keeps its original editor URL, sandbox, generation, opened file id and session across same-ID path/type/MIME listing updates, and the active editor branch renders ahead of generated or read-only previews. `office-editor-frame.ts` owns frame authority, generation, ready/state validation, the ten-second ready deadline, and the current-frame `save` command. Each explicit Edit, Retry or Open again creates a local activation; Retry and Open again continue a captured activation and do not admit an unselected or never-admitted non-Office file. Revision, rename/path/type/MIME, other-file listing updates and the first session id do not rebuild the iframe.

The editor uses the current chat's canonical `/ocu/preview/{chat}?embed=office` URL. Its code-fixed `sandbox="allow-scripts allow-same-origin"` and `allow=""` consume [B1 item 14](../../../evidence/issue-119/2026-10-03-b1.md#14-minimal-tested-iframe-capabilities), not settings or broker metadata. Source, page origin and actual frame URL precede exact-key/type/binding checks. One accepted ready produces one origin-targeted open; state before ready, duplicate ready/state and retired authority do no work. `save` posts exactly `{type:'ocu:office-command', chat_id, generation, command:'save'}` to the page origin for the currently attached, opened, URL-matching frame and current generation while the store reports `editing`; it sends no `file_id`, HTTP save or close, and does not mutate displayed state.

Ready expiry revokes generation authority before showing failure/Retry; the captured activation remains until genuine revocation so Retry can continue it. Feature/workspace enablement, saved-chat/canonical-base, selected-ID/removal, view, chat, lifetime and teardown still retire owned listeners/timers without sending close. Edit opens directly without launching a stopped sandbox or reading versions. `OfficeEditorStatus` is the single projection of the latest accepted `ocuOffice` snapshot: opening, unsaved, saving (`saving`/`closing`), saved, conflict, failed (`error`, or `editing` with a non-null reason), expired and refused. Save is enabled only in `editing`. Validated `refused` and `closed` retire through the existing cleanup path and restore the selected file's read-only preview. Maximize is a component-local boolean on `WorkspaceArtifact`. The existing selected-file wrapper stays in the same DOM tree; while maximized it is a native `popover="manual"` with explicit viewport geometry, which places it on the browser top layer. The `popover` attribute is absent in ordinary sidebar mode. Restore, retirement, replacement, timeout and unmount remove top-layer and attribute state. The same editor iframe, `src`, sandbox, allow, generation and session survive both transitions. Save in the overlay uses the current-frame command path. No Fullscreen API, portal, second frame, store field or production fallback to a local-z-index overlay is added.

Retirement exposes activation invalidation as a reactive assignment so the frame, status and read-only preview projections settle in the same update. Controller disposal remains the cleanup owner; re-enabling a feature does not resurrect a retired activation.

History belongs to a captured chat/file opening, not the editor store. It stays inside the selected-file wrapper so it remains visible above a maximized editor without moving the frame. Dismissal or lost context invalidates asynchronous completions; same-ID metadata does not restart the read. A local live frame blocks version restore; a remote `open_session` remains the broker's decision. A pending mutation prevents duplicate submission. Only an authoritative reload replaces rows; refusal preserves them, and an accepted restore with failed reload is reported distinctly.

## Alternatives considered

- **Reuse workspace failure mapping** — folds 404 to `not_found` and drops unrecognized broker reasons that later status and restore UI must show.
- **Add `refused` to `OfficeSessionState`** — treats a host-only creation outcome as a persisted broker session and widens every HTTP status type.
- **Keep store `state` as broker-only** — later consumers cannot record a valid `ocu:office-state` refusal without a cast or a second owner.
- **A second exported editor-state alias unused by the store** — dead public surface for a one-field domain difference.
- **Store host `session_id: null` as `null`** — a second optional-field convention beside workspace absence.
- **Global current-chat pointer** — retargets an in-flight result when another chat becomes current.
- **Key the editor by revision/path or its first session id** — reloads a live frame when workspace metadata or the initial create response arrives.
- **Use user iframe settings or the read-only policy** — substitutes an unmeasured capability set for B1's editor-specific outer policy.
- **Latch Saved or Saving from the Save click** — invents a publish outcome the host page has not reported.
- **A second chat-keyed status store beside `ocuOffice`** — splits authority from the generation-bound snapshot the frame already writes.
- **Portal or cloned iframe for maximize** — detaches or duplicates the live document instead of changing the existing wrapper's presentation.
- **Fullscreen API for maximize** — enters browser fullscreen rather than the required in-page overlay.
- **Fixed overlay with a local z-index** — remains underneath the Navbar and Controls separator stacking contexts, so geometry expansion is not page coverage.
- **Disable restore from the listing's open session** — denies broker recovery of a forgotten session or another tab's authoritative refusal.
- **Optimistically append a restored version** — invents broker numbering and publication state before the authoritative reload.

## Consequences

Workspace consumers keep their allow-list and 404 folding; Office callers must switch on literal broker reasons. Frame and guard modules map a refused host message into this store, including `sessionId: undefined` when the host reports no session, and they must not follow or close a refused page. Omitting `sessionId` from a partial update leaves a previous id in place. Status text is derived only from the latest valid snapshot; a click never changes the displayed state.
Browser proof correlates a real gateway session creation with the parent store's accepted chat/file/session and editing state. The [editor screenshot](../../../evidence/issue-153/office-editing.png) shows the deterministic stub host, not a real DocumentServer. Desktop maximize evidence is the [sidebar](../../../evidence/issue-156/office-maximize-sidebar.png) and [overlay](../../../evidence/issue-156/office-maximize-overlay.png) pair: the overlay is the existing wrapper on the native top layer, Save/Restore remain usable, and the same live iframe document remains. B1 measured three-format open/input/export flows under this outer policy; clipboard, camera, microphone, screen capture, printing and popup/download UI remain unmeasured.
