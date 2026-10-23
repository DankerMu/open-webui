## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-office-editor-status-recovery --strict --no-interactive`.

## 2. Implement (in open-computer-use)

- [x] 2.1 Diagnose the stale `storage_low` at the broker test layer, before any change. Use the existing office session and callback test helpers in `tests/orchestrator/`.
  - Reproduce B-T11's sequence: a save meets `storage_low` in the callback phase (`_recover_outstanding`, `callback.py:432-442`) or in publish; space is then freed; a new save is accepted and reaches its outcome.
  - Record the session `reason` after each step.
  - Check the candidate paths: `_reconcile_save` NOTHING_TO_SAVE with the latest version published; a successful persist (status 6); `_save_session` accepting into `saving`.
  - Name the layer, with the evidence line.
- [x] 2.2 Tests first in `tests/orchestrator/test_office_editor.py`. Add the harness non-JSON response option. Write design.md evidence (a), (a2), (b), (b2), (c) and (c2) as tests. Record red on `e016eb6` for (a), (a2) and (c2) where they assert new behaviour, and green for (b) and (b2)-first.
- [x] 2.3 Tests first for (d) at the 2.1 layer. Record red on `e016eb6`, unless 2.1 shows no fix is needed. If the layer is the client, align the harness `/save` fake with the broker first.
- [x] 2.4 Implement per design.md:
  - classify by status before parsing;
  - add the backoff counter and delay (reuse `pollTimer`) and reset it on an applied status;
  - keep first-status terminal handling;
  - confirm that `dispose` clears a pending backoff timer through `stopTimers`;
  - add the stale-reason clear at the 2.1 layer, on the successful outcome only.
- [x] 2.5 Green, in this order:
  - the touched test modules, plus `test_callback_failure_keeps_save_and_autosave_usable` and the office session and callback test modules;
  - the CI-shaped container run of those modules (Linux, `python:3.13`, CI requirements), because the OCU `build.yml` unit job is disabled on the fork;
  - `./tests/test-project-structure.sh`.

## 3. Verify

- [x] 3.1 Acceptance host (orchestrator, after merge): design.md evidence (e). Rebuild the server image from the merged SHA and record its digest, check the served `office-editor.js` hash against the merged blob, run the restart scenario, then bring the stack back with `deploy/up.sh`.

## Risk packs

Selected:

- **Error handling / retry:** covered by the classification table and backoff (2.2 (a), 2.4).
- **Legacy compatibility:** the terminal rows are unchanged (2.2 (b)), and so is the parent protocol (no new state).
- **Concurrency:** covered by 2.2 (a2), (b2), (c) and (c2):
  - a status flight coalescing with the backoff timer;
  - a save during an outage;
  - dispose during backoff;
  - the first status request versus `openSession`.
- **Test evidence:** red on `e016eb6` for (a), (a2), (c2) and (d), and the real restart on the host (3.1).

Not selected:

- **Auth:** 401 and 403 stay terminal, and no credential handling changes.
- **Schema / config:** no persisted format change. A broker `reason` clear, if any, changes a value, not the schema.
- **Documentation:** `docs/office-editing.md` (WebUI) does not describe status-poll failures. Add one sentence only if the user-visible behaviour section mentions closing the editor after an OCU restart.
