## Why

#638. In the B-T11 "ENOSPC during a write" row (2026-10-25, OCU `1dba74e`), the chat's filesystem was filled after the save's version was stored. The publication behaved correctly:

- the workspace kept its old bytes;
- the version and the journal obligation were retained;
- `state.json` stayed valid;
- after space returned, the obligation was published.

The editor did not:

- The status poll `GET /api/office/{chat}/sessions/{sid}` answered 500 `{"reason":"state_corrupt"}` while the disk was full.
- Every status read writes `state.json`. `_session_status` calls `notice.refresh_workspace_notice` with `activity_at=time.time()`, so `store.update` always runs (`office/sessions.py:601-604`, `office/notice.py:34-52`). Restore-epoch orphaning writes through the same store.
- The ENOSPC-prone calls in `OfficeStore._write_state` raise a bare `OSError`: the temp-file `os.open`, `os.write` and the file `fsync` (`office/store.py:263-268`, `:341-346`).
- `session_status` maps every `OSError` to 500 `state_corrupt` (`office/sessions.py:580-581`).
- The editor page treats HTTP 500 as final (`static/office-editor.js:268-271`; requirement "Transient status failures do not end the editor"). It showed `Failed: state_corrupt` and disabled Save until the editor was closed.
- `save_session` in the same module already answers ENOSPC with 503 `storage_low` (`:168-171`). After the first status, the editor treats any 502/503/504 as transient (`office-editor.js:248`, `:264-267`).

## What Changes

In `open-computer-use`:

- `session_status` answers 503 `{"reason":"storage_low"}` when the bare `OSError` it catches has `errno.ENOSPC`. This is the same branch `save_session` has. Every other failure keeps its current answer.
- The editor needs no behaviour change; its existing transient handling keeps it usable.
- One stale comment is corrected: `office-editor.js:19` says the broker never sends 502/503/504 as a verdict.

Must preserve:

- `RestoreEpochError`, `StateCorruptError`, `CorruptIndexError` and other `OutputsBrokerError`s still answer 500 `state_corrupt`, and so does a non-ENOSPC `OSError` (for example EIO);
- `UnknownSessionError` 404, `CommittedCloseError` and `StateDurabilityError` (directory fsync after commit) are unchanged;
- the publication path and callback answers are unchanged.

Out of scope:

- the 1 GiB floor;
- other endpoints' error mapping;
- editor behaviour.

The outputs listing also answers ENOSPC with 500 (`app.py:109-123`, the source of the `outputs broker failure: OSError: [Errno 28]` log lines in the same run). That is reported separately, not changed here.

## Capabilities

### Modified Capabilities

- `ocu-office-editor-embed`: new requirement "An out-of-space status read is transient".

## Impact

A full disk shows as a transient condition. The editor stays usable and status resumes by itself once space returns, instead of claiming the state is corrupt.

## Triage

```text
Issue type: bug (misreported error, editor ends needlessly)
Fixture level: compact
Upstream suggested level: issue says S; compact: one except branch in one endpoint
Blast radius: Office status polling during disk-full; a wrong mapping could hide real corruption as transient
Selected risk packs: Error handling (ENOSPC vs other OSError)
Evidence floor: endpoint test injecting OSError(ENOSPC) into the store write (pattern of tests/orchestrator/test_office_notice.py:585-600) -> 503 storage_low, snapshot unchanged, next status 200 after the patch is removed; EIO control stays 500 state_corrupt; red on 1dba74e; existing editor tests named (test_office_editor.py:637 503-json, :656 back-off reset, :721 first-status 503 still final); office test modules in the CI-shaped container; ./tests/test-project-structure.sh
design.md: not required (compact)
```
