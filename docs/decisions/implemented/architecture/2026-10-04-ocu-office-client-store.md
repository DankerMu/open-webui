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

`WorkspaceArtifact` offers the existing `Edit` action in the selected-file bar only for a saved chat with both workspace and Office features literally true and broker type docx/xlsx/pptx. Current broker type gates that fresh Edit only. An admitted editor keeps its original URL, sandbox, generation, opened file id and session across same-ID path/type/MIME listing updates, and renders ahead of generated or read-only previews. `office-editor-frame.ts` owns frame authority, generation, ready/state validation, the ten-second ready deadline, and the current-frame `save` command. Each explicit Edit, Retry or Open again begins a user activation; Retry and Open again retain the captured file's admission and do not admit an unselected or never-admitted non-Office file. Revision, rename/path/type/MIME, other-file listing updates and the first session id do not rebuild the iframe.

The editor uses the current chat's canonical `/ocu/preview/{chat}?embed=office` URL. Its code-fixed `sandbox="allow-scripts allow-same-origin"` and `allow=""` consume [B1 item 14](../../../evidence/issue-119/2026-10-03-b1.md#14-minimal-tested-iframe-capabilities), not settings or broker metadata. Source, page origin and actual frame URL precede exact-key/type/binding checks. One accepted ready produces one origin-targeted open; state before ready, duplicate ready/state and retired authority do no work. `save` posts exactly `{type:'ocu:office-command', chat_id, generation, command:'save'}` to the page origin for the currently attached, opened, URL-matching frame and current generation while the store reports `editing`; it sends no `file_id`, HTTP save or close, and does not mutate displayed state.

Ready expiry revokes generation authority before showing failure/Retry; captured file admission remains until genuine revocation so Retry can continue it. Controller cleanup retires owned listeners/timers; the leave guard owns departure commands before retirement. Edit reads versions before creating a frame and never launches a stopped sandbox. `OfficeEditorStatus` projects the latest accepted `ocuOffice` snapshot: opening, unsaved, saving (`saving`/`closing`), saved, conflict, failed (`error`, or `editing` with a non-null reason), expired and refused. Save is enabled only in `editing`. Validated ordinary `refused` and `closed` reports retire through the existing cleanup path and restore the selected file's read-only preview.

Maximize is a component-local boolean on `WorkspaceArtifact`. The existing selected-file wrapper stays in the same DOM tree; while maximized it is a native `popover="manual"` with explicit viewport geometry, placing it on the browser top layer. The attribute is absent in ordinary sidebar mode. Restore, retirement, replacement, timeout and unmount remove top-layer and attribute state. The same iframe, `src`, sandbox, allow, generation and session survive both layout transitions. Overlay Save uses the current-frame command path. No Fullscreen API, portal, second frame, store field or local-z-index fallback is added.

Retirement exposes activation invalidation as a reactive assignment so the frame, status and read-only preview projections settle in the same update. Controller disposal remains the cleanup owner; re-enabling a feature does not resurrect a retired activation.

History belongs to a captured chat/file opening, not the editor store. It stays inside the selected-file wrapper so it remains visible above a maximized editor without moving the frame. Dismissal or lost context invalidates asynchronous completions; same-ID metadata does not restart the read. A local live frame blocks version restore; a remote `open_session` remains the broker's decision. A pending mutation prevents duplicate submission. Only an authoritative reload replaces rows; refusal preserves them, and an accepted restore with failed reload is reported distinctly.

`OfficeConflictDialog` stays inside the selected-file wrapper, including its maximized top layer. Live authority binds chat/file/generation/session; frame-less authority binds the preflight activation and broker `open_session`. Each keyed instance captures that authority before subscribing, and retired callbacks stop before reading destroyed reactive props. Save-as is the focused form default; overwrite requires a second explicit confirmation and is unavailable for `path_missing`. Dismissal sends nothing and leaves a reopen control in both modes. Ordinary refusal keeps the dialog and literal broker reason; `workspace_missing` closes it with the retained-content notice and suppresses further resolves for that identity. Pending requests coalesce. Success does not rewrite editor identity or invent host state.

`WorkspaceSelectedFile` owns only the selected-file action bar's presentation. Editor admission, frame lifetime and accepted state remain with `WorkspaceArtifact` and its existing controller/store.

`OfficeOpenPreflight` owns only the current user activation and its request/prompt state. A fresh versions response decides: ended conflict first, otherwise no-session unpublished newest version, otherwise open. Restore uses the captured newest number and opens only after success; start-current sends no restore and preserves history. Read failure offers Retry without a frame; restore refusal retains choices. Unpublished-choice dismissal cancels the activation; conflict-dialog dismissal only hides that shared dialog. Successful ended-conflict resolution returns to the file entry without opening or selecting its save-as result; the next explicit Edit checks afresh.

Only a source/origin/schema/file/generation-validated `refused/unpublished_version` report with null session reaches preflight recovery. The first report retires frame authority and rechecks without a refusal banner; a second shows error/Retry. This one-recheck budget belongs to the user activation and survives frame replacement. Explicit retry starts a new activation, not a replay of a retained refused snapshot. Context revocation invalidates delayed reads and mutations synchronously; same-file metadata does not restart admission. No frame-less session or synthetic generation is written into `ocuOffice`.

`office-leave-guard.ts` captures the opened file/name, chat, session and generation for chat switch, sidebar close, editor close, file change and view change. It sends at most one existing close command per attachment and retains the original live document until broker acceptance. Child `closing` alone is not acceptance. One nonoverlapping status follower per chat/session reports saved, saved-as with destination name, ended conflict, literal failure or unconfirmed; reports belong only to the captured owner and reappear on return without reopening an editor. Refused frames are neither closed nor followed. Forced teardown cannot guarantee delivery but preserves the captured follower.

The 15-second progress deadline starts with the attachment's first close attempt; status reads are one second apart. It uses B1's measured interval plus polling/network margin, not a persistence guarantee. Expiry stops following, reports unconfirmed and releases the latest continuation once. An old response cannot release a replacement attachment; a newer attachment sharing an already-closing session without independent acceptance remains held until the deadline. Native `beforeunload` is installed only for the current attached dirty non-refused editor.

`Chat` and `ChatControls` supply calls and reactive arguments, not Office scheduling or state logic. Drawer and ResizableSidePanel accept an optional `onCloseRequest` for user Escape/backdrop/drag intent; owner prop changes and teardown do not invoke it. Unconfigured callers retain synchronous close behavior. A layout replacement must not persist a closed workspace. `Chat.svelte` alone has the user-approved 4688-line ceiling for these hooks; lint and complexity gates remain enforced, and the exception ends when the file is at most 800 lines or the hooks are removed.

Canceled Back/Forward retains its traversal delta and resumes only after SvelteKit restores the originating history entry and close admission completes; URL navigation remains separate. Supersession and component teardown dispose the rollback listener. Ended-conflict evidence follows the session status's current document after manual save-as while frame message authority stays bound to the original file/generation; recovery guidance names the destination. A pre-READY frame removed by listing or selection changes retires its activation, so returning to that file requires a fresh Edit.

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
- **Apply resolve response as a new editor identity or Saved state** — retargets a live frame or invents a host outcome before the authoritative state message.
- **Synthetic editor state for a pending conflict** — creates frame authority where no frame exists and conflates broker preflight data with accepted host state.
- **Reset the recheck allowance with every frame generation** — turns a second creation refusal into an automatic retry loop.
- **Remove the frame immediately after posting close** — browser message delivery can be discarded; posting does not establish broker receipt.
- **Treat every false visibility assignment as user close** — Drawer teardown during initial desktop layout would persist `open:false` without user intent.
- **Treat progress expiry or a pre-existing conflict as saved** — neither proves the departing document was persisted.

## Consequences

Workspace consumers keep their allow-list and 404 folding; Office callers must switch on literal broker reasons. Ordinary refused host messages map into the Office store, including `sessionId: undefined` when the host reports no session. A refused page must not be followed or closed. Omitting `sessionId` from a partial update leaves a previous id in place. Editor status text derives only from the latest valid snapshot; a click never invents an editor outcome.
Browser proof correlates a real gateway session creation with the parent store's accepted chat/file/session and editing state. The [editor screenshot](../../../evidence/issue-153/office-editing.png) shows the deterministic stub host, not a real DocumentServer. Desktop maximize evidence is the [sidebar](../../../evidence/issue-156/office-maximize-sidebar.png) and [overlay](../../../evidence/issue-156/office-maximize-overlay.png) pair: the overlay is the existing wrapper on the native top layer, Save/Restore remain usable, and the same live iframe document remains. B1 measured three-format open/input/export flows under this outer policy; clipboard, camera, microphone, screen capture, printing and popup/download UI remain unmeasured.

History evidence covers the [file entry](../../../evidence/issue-157/history-selected.png), [published restore](../../../evidence/issue-157/history-selected-restored.png) and [local-frame restriction inside the maximized wrapper](../../../evidence/issue-157/history-editor-maximized.png). These gateway/stub images do not certify real DocumentServer restoration.

The [conflict dialog](../../../evidence/issue-158/office-conflict.png) shows the gateway/stub scenario in the narrow maximized wrapper. Browser acceptance preserves the live iframe/document/session through default save-as and Files refresh, and observes the original plus the deduplicated file; it does not certify a real DocumentServer conflict.

Preflight browser evidence covers [restore-before-open](../../../evidence/issue-159/office-unpublished-content.png), [stale-session recheck](../../../evidence/issue-159/office-stale-unpublished-content.png) and an independently prepared [frame-less pending conflict](../../../evidence/issue-159/office-pending-conflict-prompt.png). Unpublished/stale stub payloads are synthetic and may show a read-only preview error; this evidence proves prompt/request/editor ordering, not valid document rendering or real DocumentServer recovery.
