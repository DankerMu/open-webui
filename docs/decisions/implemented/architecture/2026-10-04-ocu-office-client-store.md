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

The parent page needs four Office gateway operations and a place to keep editor state until later frame, status-bar and close-guard slices consume it. WebUI workspace-route error mapping folds 404 and allow-lists reasons. Broker session status never includes the host-only creation refusal. Chat-owned workspace generation already exists; Office must not reuse `artifactContents` or a global active-chat pointer.

## Decision

The parent client lives in `src/lib/apis/ocu/office.ts` and accepts only `baseUrl === '/ocu'`. Other bases fail as `0/invalid_response` before fetch. Path segments are encoded. Requests use same-origin cookies and `cache: 'no-store'`. Restore and resolve send `X-Requested-With: ocu-workspace`. Session create, save and close stay on the editor host.

Failures reuse `WorkspaceRequestError` without changing workspace mapping. Broker string `reason` values pass through with the HTTP status, including 404 and empty strings. Transport failure is `0/request_failed`. Missing, unreadable or non-string reasons are `HTTP status/request_failed`. Non-JSON success bodies are `HTTP status/invalid_response`. There is no allow-list, retry or schema validator.

Editor state lives in `src/lib/stores/ocu-office.ts` (`ocuOffice`), keyed by chat. `OcuOfficeState.state` is `OfficeSessionState | 'refused'`. Broker HTTP types keep the eight persisted session states and do not gain `refused`. Optional `sessionId` represents host `session_id: null` by absence; `applyOfficeState` clears it only when the update supplies `undefined`. Generation begin, retire and apply stay per chat: a retired or absent generation changes nothing, and work on chat A keeps chat B's object identity.

## Alternatives considered

- **Reuse workspace failure mapping** — folds 404 to `not_found` and drops unrecognized broker reasons that later status and restore UI must show.
- **Add `refused` to `OfficeSessionState`** — treats a host-only creation outcome as a persisted broker session and widens every HTTP status type.
- **Keep store `state` as broker-only** — later consumers cannot record a valid `ocu:office-state` refusal without a cast or a second owner.
- **A second exported editor-state alias unused by the store** — dead public surface for a one-field domain difference.
- **Store host `session_id: null` as `null`** — a second optional-field convention beside workspace absence.
- **Global current-chat pointer** — retargets an in-flight result when another chat becomes current.

## Consequences

Workspace consumers keep their allow-list and 404 folding; Office callers must switch on literal broker reasons. Frame and guard modules map a refused host message into this store, including `sessionId: undefined` when the host reports no session, and they must not follow or close a refused page. Omitting `sessionId` from a partial update leaves a previous id in place.
