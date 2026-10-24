## Context

`OcuWorkspaceState.notice` is one string per chat (`src/lib/stores/ocu.ts:26`). The reconciliation controller writes it, always through `setWorkspacePresentation` (`ocu.ts:287-298`), at `workspace-reconciliation.ts:412`, `:434`, `:441`, `:474`, `:511`, `:632`, `:642`, `:649`, and clears it at the start of every `run()` (`:552-556`). `run()` starts a new generation each time (`:548`, `beginGeneration` `ocu.ts:84-92`), which does not touch `notice`. `WorkspaceArtifact.svelte` shows `localNotice || workspace.notice` (`:98`) in one banner (`:491-496`); components only read `notice`.

## Decisions

### D1. Background polls do not clear; user-started runs do

`run()` passes `notice: ''` only when `mode !== 'poll'` (refresh, retry, launch, more). A link-click `run('poll', path)` (`resolvePath`, `:582`) is a poll and does not clear; the link path sets its own notice or selects a file (D3).

Consequence, accepted: after `retire`/`observe`/`mount` the first poll no longer clears either, so a notice survives a chat switch and return or a remount until a user action, a replacing notice, or dismissal.

Alternative rejected: a minimum display time. It is still a wall-clock window and does not cover a user who looked away.

### D2. Notices a later listing resolves

The store keeps a boolean beside `notice`, `noticeClearsOnListing`. Every `setWorkspacePresentation` update that writes `notice` also writes the flag (default false), so the two never disagree. The flag is true for the `presentRunFailure` notices (`:511-518`) and for `Selection changed during refresh; refresh again` (`:411-413`).

A flagged notice is cleared at exactly two success write points, reading the flag at that moment (never cached at run start):

- the phase write after `applyWorkspaceListing` (`:424-426`);
- the unavailable/disconnected phase write in `acceptDescription` (`:477-480`).

Because both come before the run's own later writes (`:433-435`, `:441`), a removal notice written in the same run survives. `Workspace view is unavailable` (`:474`) is written before them with the flag false, so it survives too. Paths that return null without a success write clear nothing: inactive generation (`:403`, `:491`, `:495`, `:500`, catch `:560`), revision regression (`:404`), and the selection-changed return (`:406-415`, which writes its own flagged notice).

Alternative rejected: matching notice text. The strings are translated, and a text match couples the rule to copy.

### D3. User actions clear the notice

The clear lives in the callers, not in the store's `selectWorkspaceFile`/`selectWorkspaceView`, because `reconcile` (`:432`) and `acceptDescription` (`:472`) call those setters right before writing their own notices:

- the controller's `selectFile` (`:670-674`) clears the store notice for the chat's current generation before its preference write;
- the component's view change (`WorkspaceArtifact.svelte` around `:329`) clears it before `selectWorkspaceView`;
- the user-started runs clear at their start (D1).

On the component paths (`WorkspaceArtifact.svelte:311`, `:332`) `Selection could not be saved` and `Workspace preference could not be saved` stay `localNotice`, as today; the link-click path writes them to the store (`:632`, `:642`) and they follow the store rule.

### D4. Dismiss button

The banner gets an icon-only button (`XMark`, following `WorkspaceArtifact.svelte:439-446`) with `aria-label` from a new key `Dismiss notice`. It carries no visible text, so the alert's text stays exactly the notice (`e2e/ocu-office-leave-fixtures.ts:747` matches it with `exact: true`). On activation it clears `localNotice` and calls `setWorkspacePresentation(chatId, <the chat's current generation read at click time>, { notice: '' })`; it issues no request and touches no other chat. Focus moves to the Refresh button afterwards, so it does not fall to the document body; while a run is busy Refresh is disabled (`WorkspaceArtifact.svelte:433`), so focus goes to the Files view button instead.

Generation is read at click time because the click is a synchronous user action; the generation guard exists to drop stale asynchronous writes, and a notice normally outlives the generation that wrote it (D1).

## Risks / Trade-offs

- A notice can outlive its cause (for example `Selected file was removed` after the user re-creates the file) until a user action, a replacing notice, or dismissal. Accepted by the owner decision.
- During an Office leave hold the panel renders the attachment snapshot (`office-leave-guard.ts:184-190`); its notice is the pre-removal one. Dismissing clears the live store notice, not the snapshot's; the hold lasts until the close completes. Accepted, no special case.
- Link click: the `Workspace preference could not be saved` write (`:628-634`) and the `selectFile` clear (`:638`) are not ordered; the preference notice can be cleared by the selection. Recorded, unchanged.
- `workspace-reconciliation.test.ts:473` asserts `''` on a dropped result; under D1 it no longer proves a clear. Its assertion stays; evidence (a)–(c) carry the new behaviour.

## Evidence plan

Vitest in `workspace-reconciliation.test.ts`, red on `main` where behaviour changes:

- (a) after a removing listing sets `Selected file was removed`, two background poll runs with unchanged listings leave it in place;
- (b) an explicit refresh clears it at start; `selectFile` clears it; a view change clears it (component test);
- (c) a failed refresh sets `Refresh failed; …`; a later successful background poll clears it; a later failed poll leaves a failure notice; a later poll on an unavailable workspace clears it;
- (d) `Selection changed during refresh; refresh again` is cleared by the next successful listing; a removal notice written in the same run as a cleared failure notice survives;
- (e) the dismiss button clears both the store notice and `localNotice`, issues no request, moves focus to Refresh (to the Files view button while busy), and the banner text equals the notice (component test, following `WorkspaceArtifact.office-status.test.ts`);
- (f) dismissing in chat A leaves chat B's notice; a notice written by a later run after a dismissal is shown.

Browser: `make verify-ui-ocu` (including `e2e/ocu-workspace.e2e.ts:604`, `:620` and the B-T13 removal case) and `make verify-ui` with a screenshot of the banner with the dismiss button.
