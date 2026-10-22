## 1. Fixture

- [x] 1.1 Compact fixture, read-only fixture review, `openspec validate ocu-office-removal-notice --strict --no-interactive`.

## 2. Implement

- [x] 2.1 Diagnose (test first; no production change yet). Mount the real `WorkspaceArtifact` with the real guard and reconciliation, following the helpers in `WorkspaceArtifact.office*.test.ts` and `office-leave-guard*.test.ts`. Setup: editor READY on `report.docx`, session `editing`, `dirty`.
  - Steps: a listing refresh drops `report.docx`. Expect:
    - exactly one `close` command posted to the editor frame (`officeCommandCalls(sent)`);
    - status polls to `/ocu/api/office/<chat>/sessions/<sid>` (the HTTP `POST …/close` comes from the frame's own page and is asserted only in 2.5).
  - The status poll returns the full closed payload:
    ```json
    {
    	"session_id": "<sid>",
    	"state": "closed",
    	"file_id": "<copy id>",
    	"saved_as": { "file_id": "<copy id>", "path": "report (2).docx" },
    	"save_seq": 1,
    	"last_committed_seq": 1,
    	"last_published_seq": 1
    }
    ```
    `closedOutcome`, at `office-leave-guard.ts:254-263`, returns `saved_as` only when both seq fields are at least `save_seq`, and `save_seq` is at least 1. The real broker advances `last_published_seq` on the copy (`open-computer-use/computer-use-server/office/publish.py:860-865`).
  - Record:
    - whether `notify` is called;
    - with which report (outcome, name, path);
    - the visible text, expected to be exactly `Office changes saved as a new file: report (2).docx`;
    - whether the panel notice shows `Selected file was removed`.
  - If the notification is missing, record the cause (early return in `report`, `delete reports[chat]` on re-attach, `presentReport` chat mismatch, or other) with the evidence line.
- [x] 2.2 Tests that must pass after the change:
  - **(a) Deleted file.** The 2.1 sequence and payload give one `close` frame command, the visible text `Office changes saved as a new file: report (2).docx`, and the panel notice `Selected file was removed`.
  - **(b) Symlink swapped in.** The listing drops the entry because it is no longer a regular file. With the same closed payload, the result is the same as (a).
  - **(c) No automatic copy.** A clean close with nothing published: `state: 'closed'`, `file_id: '<original>'`, `saved_as: null`, `save_seq: 0`. The text is `Office save unconfirmed: report.docx`, as today, and no copy is named.

  If 2.1 found the notification missing, (a) and (b) are red on `main` before the fix. If 2.1 found it present, they are green on `main`. The PR then states that the issue is closed on test evidence without a behaviour change, and that the B-T13 run missed a transient (about 6 s) toast.

- [x] 2.3 Fix only if 2.1 shows suppression: the minimal change in `office-leave-guard.ts` so that the removal-triggered departure's report reaches `presentReport` for the current chat. No change to `workspaceDepartureRequested`, to the reconciliation selection clear or its preference write, or to admission.
- [x] 2.4 These existing tests must keep passing:
  - `selection-removed` cases (`WorkspaceArtifact.office.test.ts:293`, `WorkspaceArtifact.office-status.test.ts:484`);
  - COR-3 (`office-leave-guard.review.test.ts:248`);
  - IS-1 (`office-leave-guard.review.test.ts:160`);
  - the `Selected file was removed` cases (`WorkspaceArtifact.test.ts:335`, `:402`, `:764`);
  - `walkAutomaticSaveAs`;
  - `workspace-reconciliation.test.ts`.
- [x] 2.5 Browser case in the OCU suite, extending the existing leave fixtures near `ocu-office-leave-fixtures.ts:612`.
  - **Stub:** the `office_save_as` stub already drops `report.docx` from the listing after open (`:612-620`).
  - **Trigger:** with the editor open and dirty, click "Refresh workspace files" (not "Close workspace") so that the listing refresh triggers the departure. No stub change is needed.
  - **Expect:**
    - exactly one `POST …/close`, counted with `mutationPosts(recordOffset, chatId, '/close')`;
    - the text `Office changes saved as a new file: report (2).docx` is visible;
    - the copy is listed;
    - no unexpected console errors.
  - **Evidence:** a screenshot under `.run/ui-evidence/`.
- [x] 2.6 Green:
  - the touched test files, plus `office-leave-guard*.test.ts` and `workspace-reconciliation.test.ts`;
  - `make test-frontend` once;
  - `make typecheck` (the ratchet must not rise);
  - `make lint-scoped`;
  - `make verify-ui-ocu`.

## 3. Verify

- [x] 3.1 Hosted CI green on the PR.

## Risk packs

Selected:

- State / lifecycle: the removal-triggered departure's report must reach the current chat's notification without being dropped by a later attach or owner change (2.1, 2.2, 2.3).
- UI regression: departure, selection-removed and save-as paths keep their behaviour (2.4, 2.6).

Not selected:

- Auth: no request or admission change.
- File IO / publish: the broker and the close publish are unchanged. The reconciliation preference write `selected_file_id: null` is kept, because selection still clears on removal.
- Schema, config, documentation: `docs/office-editing.md` already says unsaved changes are saved as a new file when the original is gone; no new UI concept.
