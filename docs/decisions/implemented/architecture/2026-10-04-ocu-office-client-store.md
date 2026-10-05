---
id: 2026-10-04-ocu-office-client-store
title: Office parent client uses a fixed gateway, literal reasons, and a per-chat editor store
kind: architecture
status: implemented
date: 2026-10-04
supersedes: none
references: Plan 2 D15 D16; issue 152; 2026-09-27-ocu-consumer-failures; 2026-09-27-ocu-workspace-files-consumer
---

# Office parent client uses a fixed gateway, literal reasons, and a per-chat editor store

## Problem

The parent page needs four Office gateway operations, current-frame authority and a chat-keyed editor snapshot for frame, status-bar and close-guard consumers. WebUI workspace-route error mapping folds 404 and allow-lists reasons. Broker session status never includes the host-only creation refusal. Office must not reuse `artifactContents` or a global active-chat pointer.

## Decision

The parent client lives in `src/lib/apis/ocu/office.ts` and accepts only `baseUrl === '/ocu'`. Other bases fail as `0/invalid_response` before fetch. Path segments are encoded. Requests use same-origin cookies and `cache: 'no-store'`. Restore and resolve send `X-Requested-With: ocu-workspace`. Session create, save and close stay on the editor host.

Failures reuse `WorkspaceRequestError` without changing workspace mapping. Broker string `reason` values pass through with the HTTP status, including 404 and empty strings. Transport failure is `0/request_failed`. Missing, unreadable or non-string reasons are `HTTP status/request_failed`. Non-JSON success bodies are `HTTP status/invalid_response`. There is no allow-list, retry or schema validator.

Editor state lives in `src/lib/stores/ocu-office.ts` (`ocuOffice`), keyed by chat. `OcuOfficeState.state` is `OfficeSessionState | 'refused'`. Broker HTTP types keep the eight persisted session states and do not gain `refused`. Optional `sessionId` represents host `session_id: null` by absence; `applyOfficeState` clears it only when the update supplies `undefined`. Generation begin, retire and apply stay per chat: a retired or absent generation changes nothing, and work on chat A keeps chat B's object identity.

`WorkspaceArtifact` offers the existing `Edit` action in the selected-file bar only for a saved chat with both workspace and Office features literally true and broker type docx/xlsx/pptx. Current broker type gates that fresh Edit only. An admitted activation keeps its original editor URL, sandbox, generation, opened file id and session across same-ID path/type/MIME listing updates, and the active editor branch renders ahead of generated or read-only previews. `office-editor-frame.ts` owns frame authority, generation, ready/state validation and the ten-second ready deadline. Each explicit Edit or Retry creates a local activation; Retry continues a captured activation and does not admit an unselected or never-admitted non-Office file. Revision, rename/path/type/MIME, unrelated listing updates and the first session id preserve its iframe. Activation explicitly clears retained snapshot fields through the store API, keeping the original opened file id.

The editor uses the current chat's canonical `/ocu/preview/{chat}?embed=office` URL. Its code-fixed `sandbox="allow-scripts allow-same-origin"` and `allow=""` consume [B1 item 14](../../../evidence/issue-119/2026-10-03-b1.md#14-minimal-tested-iframe-capabilities), not settings or broker metadata. Source, page origin and actual frame URL precede exact-key/type/binding checks. One accepted ready produces one origin-targeted open; state before ready, duplicate ready/state and retired authority do no work.

Ready expiry revokes generation authority before showing failure/Retry; the captured activation remains until genuine revocation so Retry can continue it. Feature/workspace enablement, saved-chat/canonical-base, selected-ID/removal, view, chat, lifetime and teardown still retire owned listeners/timers without sending close. Edit opens directly without launching a stopped sandbox or reading versions. Status/save/history/maximize/conflict controls, versions preflight and close guards are separate consumers; this entry/frame slice does not implement them.

## Alternatives considered

- **Reuse workspace failure mapping** — folds 404 to `not_found` and drops unrecognized broker reasons that later status and restore UI must show.
- **Add `refused` to `OfficeSessionState`** — treats a host-only creation outcome as a persisted broker session and widens every HTTP status type.
- **Keep store `state` as broker-only** — later consumers cannot record a valid `ocu:office-state` refusal without a cast or a second owner.
- **A second exported editor-state alias unused by the store** — dead public surface for a one-field domain difference.
- **Store host `session_id: null` as `null`** — a second optional-field convention beside workspace absence.
- **Global current-chat pointer** — retargets an in-flight result when another chat becomes current.
- **Key the editor by revision/path or its first session id** — reloads a live frame when workspace metadata or the initial create response arrives.
- **Use user iframe settings or the read-only policy** — substitutes an unmeasured capability set for B1's editor-specific outer policy.

## Consequences

Workspace consumers keep their allow-list and 404 folding; Office callers must switch on literal broker reasons. Frame and guard modules map a refused host message into this store, including `sessionId: undefined` when the host reports no session, and they must not follow or close a refused page. Omitting `sessionId` from a partial update leaves a previous id in place.

Browser proof correlates a real gateway session creation with the parent store's accepted chat/file/session and editing state. The [editor screenshot](../../../evidence/issue-153/office-editing.png) shows the deterministic stub host, not a real DocumentServer. B1 measured three-format open/input/export flows under this outer policy; clipboard, camera, microphone, screen capture, printing and popup/download UI remain unmeasured.
