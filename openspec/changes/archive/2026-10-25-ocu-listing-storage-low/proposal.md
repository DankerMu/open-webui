## Why

#639, from the same B-T11 run as #638 (2026-10-25, OCU `1dba74e`). While the chat's filesystem was full, the OCU log showed 94 `outputs broker failure: OSError: [Errno 28] No space left on device` lines. Each one was a `GET /api/outputs/{chat_id}` answered with a generic 500.

- The listing's reconcile (`app.py:128-134`) runs Office `recover_publications` and then `OutputsBroker.reconcile`. Either step can raise a bare ENOSPC `OSError`:
  - a pending `save`/`final` obligation re-raises it (`office/publish.py:1382-1384`);
  - the index write raises it (`outputs_broker.py:827-877`).
- `_outputs_http_error` (`app.py:109-125`) has no ENOSPC case. The listing's `except OSError` arm (`app.py:952-953`) therefore answers 500 "outputs listing failed".
- `StorageLowError` (`office/versions.py:35`, a `RuntimeError`) is not caught by any of the listing's except arms (`app.py:948-953`). On `1dba74e` the save/final paths never raise it: the store raises a bare `OSError` when full (`office/store.py:246-283`). It is raised only by `versions.commit_publication_lineage` on restore and resolve paths, which `publish.py:1386-1392` turns into interrupted/failed results. The one way it can escape is `publish.py:1388`, when a resolve/restore journal entry disappears mid-publication. Catching it in the listing is therefore defensive. If it did escape, the listing would answer an unhandled 500 with a server traceback but no `outputs broker failure` line.
- The Office routes answer ENOSPC with 503 `storage_low`. The existing listing test pins only a generic `OSError` → 500 (`tests/orchestrator/test_outputs_endpoint.py:465`).
- Neither client distinguishes 500 from 503 for the listing:
  - WebUI: `src/lib/apis/ocu/index.ts:137`, `workspace-reconciliation.ts:529-556`.
  - SPA: `static/ocu-request.js:189-190`, `static/preview.js:2557-2560`.
  - WebUI server refresh proxy: `ocu_client.py:94,103` → `ocu_workspaces.py:221,236,259-260`, which maps every non-2xx to 502.
  - So the defect is the misleading status class and log, not user-visible behaviour.

## What Changes

In `open-computer-use`:

- The outputs listing answers 503 with `Retry-After` (the existing transient 503 shape of `_outputs_http_error`) when reconcile or publish recovery raises an `OSError` with `errno.ENOSPC`, or a `StorageLowError`.
- The detail stays the generic listing text, and no host path is exposed.

Must preserve:

- a non-ENOSPC `OSError` still answers 500, and the existing broker error classes keep their statuses;
- no host path in any response detail (`test_outputs_endpoint.py:479-481`);
- `/internal/describe` behaviour for non-ENOSPC errors, since it shares the mapper;
- no client change.

Out of scope:

- the Office session status (#638);
- client wording for storage low;
- a read-only listing under storage pressure.

## Capabilities

### Modified Capabilities

- `ocu-outputs-endpoint`: MODIFIED requirement "Explicit broker failure mapping" (out of space joins the 503 class).

## Impact

Operators see a disk-full listing as a transient storage condition instead of a server error. Clients behave as before.

## Triage

```text
Issue type: bug (misleading status and log)
Fixture level: compact
Upstream suggested level: issue says S, p3; compact: one mapper branch plus one except arm
Blast radius: outputs listing and internal describe error answers
Selected risk packs: Error handling (ENOSPC and StorageLowError vs other OSError)
Evidence floor: endpoint tests next to test_outputs_endpoint.py:465 — recover_publications raising OSError(ENOSPC) -> 503 + Retry-After: 1 and 200 after undo; reconcile raising OSError(ENOSPC) -> 503; recovery raising StorageLowError -> 503 (red on 1dba74e as a raised exception); generic OSError still 500; no host path in details; tests/orchestrator outputs modules in the CI-shaped container; ./tests/test-project-structure.sh
design.md: not required (compact)
```
