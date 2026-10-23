## Why

#592, from #173 rows B-T11 and B-T10 (OCU `34dc83c`, WebUI `1b4ad1f61`):

- **OCU restart.** An editor held unsaved text, and `docker restart ocu-test-computer-use-server` took about 6 s. The status turned `Failed: session_status_failed` and stayed that way after OCU was healthy again. Save stayed disabled, although the server session was still `editing`. Only closing the editor published the text.
- **Disk full.** After a save was refused with `storage_low` and space was freed, a new Save was accepted (202), but the status kept showing `Failed: storage_low` until the editor was closed.

Paths are in the sibling `open-computer-use` checkout at `origin/main` `e016eb6`, file `computer-use-server/static/office-editor.js`:

- `refreshStatus` (`:211-252`) parses the body before it looks at the status code (`:227`, then `!response.ok` at `:233-236`). It calls `fail('session_status_failed')` from the `catch` branch on any thrown fetch or parse (`:238-241`). The gateway's own 401 (nginx `auth_request` default HTML) and 404 (the `@ocu_auth_not_found` `return 404`) are not JSON, so today they too end the client through that `catch`.
- `fail` (`:132-137`) sets `localError` and calls `stopTimers()`. `final()` (`:107`) is then permanently true. `refreshStatus` never reschedules (`:246`), and `save` (`:274`) and `close` (`:351`) return immediately. One failed poll ends the client.
- `openSession` waits for the first status: `if (!await refreshStatus() || final() || closeAccepted) return;` (`:439`).
- `report` (`:108-131`) shows `reason = refusalReason ?? localError ?? (commandReason ?? snapshot.reason)`. A successful save sets `commandReason = null` (`:314`), so a `storage_low` that persists must come from the broker session's `reason` (`snapshot.reason`) or from a final `localError`.
  - Broker writers of an `editing`-state reason (fixture review): `callback.py:401` (`forcesave_failed`), `callback.py:432-442` `_recover_outstanding` (where a callback-phase `storage_low` lands), `sweep.py:183` (`save_timeout`), and `publish.py:898-902`.
  - A successful publish for a save or final requester already clears it (`result.reason = None`).
  - Paths that might not clear it: `_reconcile_save` on NOTHING_TO_SAVE when the latest version is already published; a successful persist (status 6 autosave); and `_save_session`, which accepts a save into `saving` while keeping the old reason.

## What Changes

In `open-computer-use` only:

- **Transient status failures are retried, not final (polls after the first applied status).** The classification goes by `response.status` before any body parsing; design.md has the table. Transient means a thrown fetch, HTTP 502, 503 or 504 with any body, or a 2xx with an unparseable body. On a transient failure, `refreshStatus` does not call `fail`. It keeps the last snapshot and the current report, so the user keeps seeing `Unsaved` and an enabled Save. It then schedules the next poll with capped exponential backoff: 1 s, 2 s, 4 s, 8 s, then 10 s for every later attempt. Nothing stops it except the editor's lifetime and `dispose`. The first successful status resets the delay to `POLL_DELAY_MS` and is applied as today.
- **The first status request keeps today's terminal handling.** Until `openSession` has applied a first status, any failure, transient or not, ends the client as today. A transient failure there would otherwise make `openSession` (`:439`) return without loading DocEditor while later polls apply `editing`, leaving a session with no editor. The user just pressed Edit and sees the failure at once, so this case is unchanged.
- **No new protocol state.** The parent message keeps its existing states. A save attempted during an outage fails through the existing non-final `commandReason` (`save_failed`), and the next accepted save clears it, as today.
- **Terminal answers are unchanged.** These keep today's handling and still end the client:
  - HTTP 401, 403, 404, other 4xx and 500, with or without a JSON body; an unparseable body falls back to `session_status_failed`;
  - a 2xx JSON body that fails `validStatus` (`invalid_session_status`);
  - final broker states, and terminal reasons such as `restore_epoch_changed` and `editor_state_lost`.
- **Stale reason.** Task 2.1 first establishes, at the broker test layer, where the persisting `storage_low` comes from, starting from the candidate paths above. The fix goes to that layer only. The rule: when a later save reaches a successful outcome, the `editing`-state reason is cleared. A successful outcome is a published version, a committed persist, or nothing-to-save with the latest version already published. Accepting a save (202, entering `saving`) does not clear it, which keeps the contract of `test_callback_failure_keeps_save_and_autosave_usable`: an `editing` reason stays visible until a later success. Reasons tied to `conflict`, `error` or `orphaned` are never cleared by this rule. If 2.1 shows the reason is already cleared, so that B-T11 took a different path, the evidence is recorded and no code changes.

`design.md` records the classification and backoff rules.

## Capabilities

### Modified Capabilities

- `ocu-office-editor-embed`: new requirements "Transient status failures do not end the editor" and "A later successful save clears a previous failure reason".

## Impact

- A short OCU restart or proxy blip no longer leaves Save dead. Polling resumes when OCU answers, and the status returns to `Unsaved` or `Saved` without closing the editor.
- Sign-out (401), a deleted or foreign chat (404) and the broker's terminal reasons still end the session in the UI.
- After `storage_low` and freed space, a successful save no longer leaves the failure text showing.

## Triage

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent (issue says S); expanded because the change alters the editor client's terminal-state rule and may touch the broker's session reason
Blast radius: every open Office editor's status loop; a too-loose rule keeps a dead session "alive", a too-strict one keeps today's bug
Selected risk packs: Error handling / retry; Legacy compatibility (terminal cases); Concurrency (status flight, mutation epoch, backoff timer, dispose); Test evidence
Evidence floor: OCU tests for office-editor.js (tests/orchestrator/test_office_editor.py) and, if the broker changes, its office session tests; ./tests/test-project-structure.sh; a real OCU restart on the acceptance host
Deviation from the issue boundary: the issue lists a visible non-final "reconnecting" state as in scope; this change does not add one (it needs a new parent-protocol state and a WebUI change). User-visible consequence: during an outage the bar shows `Unsaved` with Save enabled; a Save then shows `Failed: save_failed` until the next accepted save after recovery. The issue's acceptance criteria (Save works after a ≤30 s restart, status returns, 401/404 still end the session, a successful save clears the failure text) are met without it.
```
