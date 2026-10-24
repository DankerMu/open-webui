## Why

#615. Every workspace-panel notice in the reconciliation store lives at most about 3 s while the panel is visible:

- `run()` sets `notice: ''` at the start of every run, including the background `poll` (`src/lib/components/chat/workspace-reconciliation.ts:552-556`);
- `finishRun` → `schedule()` arms the next poll 3 s after a run ends (`:39`, `:521-531`);
- so `Selected file was removed` (`:433-435`), `Refresh failed; existing files remain available` (`:514-515`) and the other notices disappear before a user who looked away can read them, and nothing records that they were shown. During an Office leave hold the live removal notice can be cleared before the panel switches back to live state (`office-leave-guard.ts:184-190`).

Owner decision (2026-10-23, #615 comment): background polls stop clearing notices; a notice is cleared only by a later run with a different outcome, by a user action (explicit refresh, file selection, view change) or by the user closing it; a successful listing clears failure notices.

## What Changes

In this repo (WebUI fork):

- `run()`: a background `poll` no longer clears `notice` at its start. User-started runs (`refresh`, `retry`, `launch`, `more`) keep clearing it at their start, as today.
- Notices that a later listing resolves are cleared when a later run writes its success result: the failure notices `presentRunFailure` sets (`:505-520`) and `Selection changed during refresh; refresh again` (`:411-413`, which the next poll re-evaluates). The other notices (`Selected file was removed`, `… preference could not be cleared`, `Workspace view is unavailable`, and the link-click notices `:632`, `:642`, `:649`) persist across background polls until another notice replaces them, a user action, or dismissal.
- User actions clear the store notice: selecting a file (`selectFile`, `:670-674`), changing the view (`WorkspaceArtifact.svelte:321-333`), and the user-started runs above (`retry` included, an extension of the owner's list: it is user-started like refresh). The component already clears its own `localNotice` on these (`WorkspaceArtifact.svelte:304`, `:329`, `:339-348`).
- The notice banner (`WorkspaceArtifact.svelte:491-496`) gets an icon-only dismiss button with its own label `Dismiss notice` (new i18n key via `npm run i18n:parse`; the existing `Close` already names the panel-close button, `ChatControls.svelte:431`, `:575`, and is matched by `namedControl`, `workspace-artifact-office-test.ts:65-69`). It clears `localNotice` and the chat's store notice.
- Plan 1 / `ocu-workspace-controls` records the rule (spec delta below).

Must preserve:

- the notice texts, the banner's `role="alert"` and styling;
- the generation guard of `setWorkspacePresentation` (`src/lib/stores/ocu.ts:287-298`): a notice from a stale generation never lands; the banner text stays exactly the notice (the button carries no visible text);
- the #604 hold in `walkRemovalNotice` and its assertions, and `e2e/ocu-workspace.e2e.ts:604` and `:620`;
- no new request: dismissal and the persistence rule are client-only.

Out of scope: Office editor status notices (`OfficeEditorStatus`), toasts, OCU server behaviour, the reconciliation timer interval.

## Capabilities

### Modified Capabilities

- `ocu-workspace-controls`: new requirement "Workspace panel notices outlive background polls".

## Impact

A removal or refresh-failure notice stays visible until the user acts on it, dismisses it, or a later run changes the outcome; the browser cases no longer race the 3 s poll.

## Triage

```text
Issue type: behaviour change (owner-decided)
Fixture level: expanded
Upstream suggested level: absent (issue says S); expanded: product-visible behaviour change in the reconciliation store, the controller and the panel component
Blast radius: every workspace-panel notice for every user; a wrong rule leaves a stale notice or clears one too early
Selected risk packs: Invariant / state (notice lifecycle across runs and generations); Error handling (failure notices cleared by success only); UI (dismiss control, accessibility)
Evidence floor: Vitest for each scenario in the spec delta (red first where behaviour changes); make test-frontend; make typecheck; make lint-scoped; make verify-ui-ocu; make verify-ui (UI-visible change); screenshot of the banner with the dismiss button
design.md: present
```
