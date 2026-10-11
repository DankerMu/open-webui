# Design

## Governing invariant

An accepted upload remains readable even when listing it requires a later page that intentionally fails. The smoke must not turn that expected 503 into success, nor move uploads onto page one to simplify its assertions.

## Existing seams

`_fixture_outputs` supplies 101 rows for each selected scenario. `_outputs` appends uploads before slicing 100-row pages; `partial_after` rejects every positive cursor, mapped to 503 `listing_incomplete`. `_serve_file` independently serves accepted upload bytes. All of this code remains unchanged.

## Scenario setup

Create an owned temporary JSON map before starting the main stub, using two dedicated chat aliases. Pass `OCU_STUB_FIXTURES` only to that process and remove the map through the existing cleanup trap. Do not export new overrides into the later Office smoke processes.

A nonempty fixture path also enables real-asset preview code when `ASSET_ROOT.is_dir()`; an unset asset root becomes the current directory. Preserve the placeholder default by giving only the main stub an explicit non-directory asset default, using the existing harness convention. Preserve an explicitly supplied asset root. The parent shell environment and Office asset autodiscovery must remain unchanged. Add a concise comment naming this failure mode.

## Public checks

- `large`: establish the 101-row fixture, upload one unique file, verify page one still has 100 original paths and advertises cursor 100 with no uploaded path. The successful cursor-100 page contains the uploaded path exactly once after the remaining fixture path. Retrieve the uploaded bytes exactly.
- `partial_after`: accept one unique upload, verify the first 100 original paths and cursor 100 without the uploaded path. Request cursor 100 and assert 503 with `listing_incomplete`, not a successful listing. Verify byte-exact file retrieval independently, including after that failure.
- Existing ordinary-chat, reserved-name, control-character, traversal, concurrent upload and Office checks remain intact.

## Oracle qualification

Parent runs the new smoke against the unchanged stub and records GREEN. In disposable copies only, (1) omit uploaded entries from the `large` listing and (2) suppress the intentional `partial_after` later-page error. Each must cause the new scenario assertion to fail semantically after unrelated controls pass. Restore the original copy and require full GREEN. Preserve source/smoke hashes and clean owned copies/processes/maps on success or failure.

## Non-goals and acceptance

No new production behavior, UI/browser certification, generic pagination helper, retries, altered 503 policy or fixture ordering. Implementer edits only the smoke; parent owns all executions and acceptance. The permanent diff must leave `scripts/ocu-stub.py` and sibling fixture modules byte-identical. Rollback is reverting the focused test change; no migration exists.
