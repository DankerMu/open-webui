## Context

`_require_cursor_lag` reads each live chat's restored index with `_index_snapshot` (`deploy/recovery_resources.py:1512-1526`), refuses a missing index under a positive cursor, and otherwise asks the selected release's broker for the counter through `_broker_listing`, which today reconciles. The broker already has a read-only entry point, `current_revision` (`computer-use-server/outputs_broker.py:128-135`), which takes the chat's combined lock, validates the chat root and reads and validates the index.

## Decisions

### D1. Probe, not reconcile

The helper subcommand returns `{"revision": current_revision(chat_id)}`. It keeps the helper's environment setup (`recovery_helper.py:15-27`: `BASE_DATA_DIR`, no Docker variables, `/app` on the path). The mount stays read-write because `_combined_lock` creates `<chat>/.lifecycle.lock` when it is absent (`computer-use-server/docker_manager.py:257-266`, reached through `:333`), exactly as reconcile does today; that is the only possible write, and `.ocu/index.json` is never written (`_read_index` opens the control directory with `create=False`, `outputs_broker.py:306-307`).

The helper comes from the current checkout's `deploy/` and the broker from the selected image's `/app` (`deploy/recovery_resources.py:627-628, 662`). `current_revision` exists since 39b2aee, before recovery itself (1e0d3cc), so every restorable release has it.

Alternative rejected (#627): keep reconcile and relax the post-check to identity preservation. Restore would still fail on any name the live listing refuses (#617), still rewrite the restored index before readiness, and become the first scan of an arbitrarily large tree.

### D2. Checks kept

`_broker_revision` reads the snapshot, runs the probe, refuses a helper failure with its cause (`_helper_detail`), refuses a probe counter that differs from the snapshot counter, and re-reads the snapshot to assert counter, active paths, file_ids and revisions are unchanged (now a no-write assertion). The missing-index shortcut (`:1484-1485`) and `_require_cursor_lag`'s cursor rule stay.

### D3. Names

The helper subcommand and the function are renamed to say what they do (`revision`, `_broker_revision`); the unit tests that patch `_broker_listing` (`tests/deploy/test_recovery.py:3197-3218`) follow. No other caller exists (`run_broker_helper` is called only at `:1486`).

## Risks / Trade-offs

- An index that the selected release can read but that lags the tree is accepted; the first live listing after activation records the lagging events. That is the source's own behaviour.
- The scan's own refusals (scan limits, an unsupported name, an unsafe `outputs/` path) no longer surface at restore; they surface on that chat's first listing after activation, as they would have on the source.
- A restore onto a release whose broker cannot read the index (for example an older image and an index with an entry #617 added) is still refused, with the probe's error.

## Evidence plan

- Red-to-green: restore CLI tests in `tests/deploy/test_recovery.py`, using the fake docker that runs the real helper (`tests/deploy/fakebin/docker:1717-1734`): after `_seed_chat`, without reconciling, (a) add a file under the live chat's `outputs/`, (b) delete an indexed file, (c) grow an indexed file; back up and restore each. On `54be6fb` all three fail with `chat <id> first recovered listing rewrote broker identity` (reconcile bumps the counter, which is checked first at `:1500-1502`); after the change they succeed and the restored `.ocu/index.json` bytes equal the captured ones.
- Regression guards (already green on `54be6fb`): cursor lead (`:1930-1969`), missing index with cursor > 0, a non-JSON index and a well-formed index missing an active entry's `file_id` (one test per spec scenario), each refused before `.restored`. Malformed JSON fails in `_index_snapshot` before the probe runs (unchanged, not wrapped); a well-formed index that fails the broker's `_validate_index` (for example an active entry without a `file_id`) is refused by the probe, and the error carries `_helper_detail`'s cause. The corrupt index is planted in the source chat before backup (the recovery set is checksummed, and backup does not read the index), not by editing captured bytes.
- Helper unit test, run in a subprocess like the existing broker calls (`test_recovery.py:240-256`): `recovery_helper.py revision` over a tree with unindexed files prints the counter and leaves the index bytes unchanged; over a chat with no index prints 0 and creates no index.
- Updated unit tests for the rename (`:3197-3218`).
- CI-shaped container run of `tests/deploy` as uid 1001 and the root-only cases as uid 0; `./tests/test-project-structure.sh`.
