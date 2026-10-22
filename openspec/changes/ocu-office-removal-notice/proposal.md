## Why

#593, from #173 row B-T13 (OCU `34dc83c`, WebUI `1b4ad1f61`). The Office editor was open with unsaved text, and the workspace file was deleted from outside, or replaced by a symlink. About 0.7 s after the next listing refresh, the sidebar closed the editor by itself. The close publish met `path_missing`, and the broker saved the content as `<name> (2).docx` (D13, unattended branch). The B-T13 record says "no conflict dialog or notice was shown". The editor disappeared and a new file appeared in the list. Content is safe and the deleted path is not recreated; the gap is that the user is not told what happened.

How it closes today (fixture review of this change, verified in code):

- `src/lib/components/chat/workspace-reconciliation.ts:425-444`: when a listing no longer contains the selected file, the selection is cleared, the panel notice `Selected file was removed` is set, and the preference `selected_file_id: null` is written.
- `src/lib/components/chat/office-leave-guard.ts:456-479`: `workspaceDepartureRequested` treats a file that is not listed, or a changed selection, as a departure, so `depart` → the close publish → the broker's D13 copy.
- The guard records an outcome report for every departure, including `saved_as` (`:206-222`, `:261`), and shows it with `presentReport` → `notify` (`:164-173`). Whether that notification fired in this sequence, and what it said, is not known. It may have been suppressed: `report` returns early when `latest.get(chat) !== owner`, and `attach` runs `delete reports[chat]` (`:543`). Or it may have been a transient toast that the run's screenshots missed.

The issue accepts either remedy: keep the editor open (then the conflict dialog handles Save), or tell the user that the file was removed and where the content went. This change takes the second.

## What Changes

- **Diagnose first (task 2.1).** Reproduce the issue's order of events against the real guard and reconciliation: the listing refresh drops the open file, then the guard departs. Record whether `notify` is called with the `saved_as` report and which text it shows.
- **Expected visible outcome, whatever the diagnosis.** When an open editor closes because its file left the listing, and the close publish produced an automatic copy, the user sees a notification naming the copy: the guard's existing `saved_as` message with the copy's file name, for example `report (2).docx`. The workspace panel's `Selected file was removed` notice is kept.
  - If the diagnosis shows the notification is suppressed, fix that suppression in `office-leave-guard.ts`.
  - If it already fires, the change adds the missing test proof only. The B-T13 observation is then recorded as a missed transient toast, and the issue is closed on that evidence.
- **No change** to the departure rule, the reconciliation selection clear or its preference write, conflict admission, or the broker.

Rejected alternative: keep the editor open while its file is unlisted. That would change four layers:

- the guard's departure trigger (`:465`);
- the reconciliation selection clear and its preference write (`:425-444`);
- the conflict-dialog admission rule (`fileAdmitted`, `office-leave-guard.ts:660-675`; `OfficeConflictDialog.svelte:84,107`);
- the component (`WorkspaceArtifact.svelte:102`, `:122-126`).

It would also need a save-as continuation on an unlisted original id. That is a cross-component lifecycle change, out of proportion to a P3 issue whose acceptance criteria also accept a clear notification.

`design.md` is omitted (compact fixture: notification path only).

## Capabilities

### New Capabilities

- `ocu-office-workspace-ui` (in flight: defined by the unarchived `ocu-office-editing` change, absent from `openspec/specs/`; same path reused, following `archive/2026-10-15-ocu-office-native-delivery/proposal.md:19`): new requirement "Removal-triggered close names the saved copy". ADDED is safe whichever change archives first because the requirement name is unique.

## Impact

- A user whose open file is deleted or replaced from outside sees which file now holds their unsaved changes.
- Behaviour, requests and broker outcomes are otherwise unchanged.

## Triage

```text
Issue type: bugfix (missing user notification)
Fixture level: compact
Upstream suggested level: absent (issue says S)
Blast radius: the leave guard's outcome notification for one departure cause
Selected risk packs: State / lifecycle (notification ownership across the departure); UI regression (existing departure, selection-removed and save-as paths)
Evidence floor: guard/component tests for delete and symlink; existing guard, reconciliation and WorkspaceArtifact tests; make test-frontend; make typecheck; make lint-scoped; make verify-ui-ocu
```
