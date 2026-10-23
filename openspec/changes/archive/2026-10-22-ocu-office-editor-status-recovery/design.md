## Design

Change surface (OCU):

- `computer-use-server/static/office-editor.js`: `refreshStatus` and the backoff state;
- `tests/orchestrator/test_office_editor.py`;
- for the stale reason, only the layer task 2.1 names among `computer-use-server/office/callback.py`, `publish.py`, `sessions.py` and `sweep.py`, with their tests.

The harness in `test_office_editor.py` gains a non-JSON body option.

Classification of a status poll outcome. It applies only after the first status has been applied; the first status request keeps today's terminal handling (see proposal). The classification goes by `response.status` first, and the body is parsed only after the class is known.

| Outcome                                                                                                              | Class     | Handling                                                                      |
| -------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------- |
| `fetch` throws (network error, connection reset), not because `lifetime.signal` aborted                              | transient | keep the snapshot, schedule a backoff poll                                    |
| HTTP 502, 503 or 504, any body (nginx static upstream answers 502 HTML when OCU is down, 504 on connect timeout)     | transient | keep the snapshot, schedule a backoff poll; the body is not parsed            |
| HTTP 2xx with an unparseable body (for example a body truncated while OCU shuts down)                                | transient | keep the snapshot, schedule a backoff poll                                    |
| HTTP 2xx, JSON, `validStatus` false                                                                                  | terminal  | `fail('invalid_session_status')` (unchanged)                                  |
| HTTP 401, 403, 404, other 4xx or 500, JSON body                                                                      | terminal  | `fail(reasonOf(body, 'session_status_failed'))` (unchanged)                   |
| HTTP 401, 403, 404, other 4xx or 500, unparseable body (the gateway's nginx 401 HTML, the `@ocu_auth_not_found` 404) | terminal  | `fail('session_status_failed')` (today reached through `catch`; now explicit) |
| HTTP 2xx, valid status with a final state or a terminal reason                                                       | as today  | `applyStatus` (unchanged)                                                     |

The broker's status route answers only 200, 404 or 500 (`sessions.py:557-570`), and the office middleware answers only 404. Treating 503 as transient therefore never swallows a terminal broker answer.

Backoff:

- Delays: `POLL_DELAY_MS` × 2ⁿ, giving 1 s, 2 s, 4 s and 8 s, then capped at 10 s.
- Reset: the counter goes back to 0 on the first applied status.
- Bounds: it does not give up on its own, because the editor's lifetime and `dispose` bound it.
- Status flights: the existing `statusFlight`, `refreshAgain` and `mutationEpoch` coalescing is kept, so one flight stays in flight at a time. A save during an outage still runs `refreshStatus` afterwards (`dispatchSave` `finally`). That call joins or starts a flight but does not reset the backoff unless a status is applied.

Must preserve:

- the terminal rows above;
- `fail` and `final()` semantics for every terminal case;
- the protocol message shape and state set seen by the parent (`ocu:office-state`);
- save and close dispatch rules;
- auto-save timing;
- `dispose` stopping every timer, including a pending backoff timer.

Governing invariant: the client becomes final only on an answer from OCU that ends the session (terminal row), or on `dispose`. It never becomes final because OCU could not be reached.

Stale reason (task 2.1 decides the layer).

- Input: a session in `editing` with reason `storage_low`, set the way B-T11 set it (2.1 identifies the path). Space is then freed, and a new save is accepted and reaches a successful outcome.
- Expected: the next broker status for the session has `reason: null` with `state: 'editing'`. The parent report then carries `reason: null`, and WebUI shows `Saved` or `Unsaved` instead of `Failed: storage_low`.
- When the reason clears: on the successful outcome (a published version, a committed persist, or nothing-to-save with the latest version published), never on acceptance (202, `saving`).
- Must keep: `test_callback_failure_keeps_save_and_autosave_usable` stays green, so an `editing` reason stays visible until a later success. Reasons tied to `conflict`, `error` or `orphaned` are never cleared.

Sibling surfaces:

- `close`/`dispatchClose`, which use the same `final()`;
- `drainQueuedPublish` and `drainSaveWaits`;
- WebUI `OfficeEditorStatus.svelte`, which shows `Failed: <reason>` for `editing` with a reason and needs no change;
- the WebUI leave guard, which follows status independently through the parent and stays unchanged.

Required evidence:

- **(a) Transient classification.** The harness gains a non-JSON response option, where `json()` throws. Three cases, each after a first applied status, each followed by a successful status:
  - one thrown fetch;
  - one 502 with a non-JSON body;
  - one 503 with a JSON body.

  Expected in each case: the client stays non-final, a Save afterwards dispatches, and polling resumes. Red on `e016eb6`, where each ends the client with `session_status_failed`.

- **(a2) Backoff schedule.** At least 5 consecutive transient failures, then a success. Expected: `timerDelays` reads 1000, 2000, 4000, 8000, 10000 (the cap), and the next delay after the applied status is 1000.
- **(b) Terminal stays terminal.** Green on `e016eb6`, and must stay green:
  - 401 with a JSON body;
  - 401 with a non-JSON body;
  - 404 with a non-JSON body;
  - 500;
  - a 2xx JSON body with the wrong `session_id`.
- **(b2) First status.** A 502 on the very first status request still ends the client as today (the `openSession` invariant). A first-status success followed by a 502 and then a success recovers, and the DocEditor stays loaded.
- **(c) Dispose during backoff.** No further fetch is made and no timer is left.
- **(c2) Save during an outage.** Status polls are failing transiently, and the user saves.
  - The save's transport fails, so `commandReason` becomes `save_failed` and the client stays non-final.
  - The `refreshStatus` in `dispatchSave`'s `finally` joins the same flight: `maxActiveStatuses == 1`, and the backoff is not reset.
  - After recovery a status is applied, and the next accepted save clears `commandReason`.
- **(d) Stale reason.** Write it at the broker test layer: the 2.1 reproduction is red on `e016eb6` if a fix is needed, then its fix makes it green. If 2.1 places the cause in the client, first make the harness `/save` fake match the broker (it currently sets `reason: null` on accept), so that a client-level test can actually go red.
- **(e) Acceptance host, after merge.**
  - Rebuild `COMPUTER_USE_SERVER_IMAGE` from the merged SHA and record its digest. The static files are copied into that image; there is no bind mount.
  - Fetch `static/office-editor.js` through the gateway and compare its sha256 with the merged blob.
  - Force-reload the editor iframe.
  - Then, with an editor open on unsaved text, run `docker restart ocu-test-computer-use-server`. After OCU is healthy, expect: the status returns to `Unsaved`, Save publishes a new version without closing the editor, and the version is listed in the history.

Non-goals:

- DocumentServer's own connection-lost dialog;
- a visible "reconnecting" indicator, which needs a new parent-protocol state and a WebUI change (recorded as a deviation in the proposal's Triage);
- retrying save and close requests themselves; their failures remain non-final `commandReason`s, as today;
- a WebUI restart making nginx `auth_request` answer 500, which stays terminal and is out of scope.
