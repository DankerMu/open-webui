## Existing boundaries

`uploads.claim_file_no_replace` borrows staging/destination directory descriptors, attempts the original name first, and retries only occupied names through atomic `os.link`. `app._store_upload` owns descriptor and private-stage cleanup; `upload_file` maps failures. Office `save_as.drive` chooses numbered candidates, rejects occupied/indexed names, persists attempt metadata, calls the same claim helper, and handles raced fallback ownership before retrying. Recovery proves inode ownership; it does not require the original stem prefix.

## Decision

Keep normal implementation planning: one shared naming boundary and its two consumers, no new subsystem or staged compatibility layer.

Add one formatter in `uploads.py`, reused by the claim retry and Office's existing numbered loop. It reads `PC_NAME_MAX` from the borrowed destination descriptor and budgets filesystem-encoded bytes for the complete last suffix and current ` (N)`. Retain the longest whole-character stem prefix; use `_` only when no complete stem character fits but one ASCII byte does. Recalculate for each number, including9→10. Do not replace the name with a hash, add ellipses, shorten the suffix, or hardcode255.

The ordinary upload claim attempts the original name before needing a collision budget: a legal free name remains byte-for-byte unchanged. A nonpositive/indeterminate limit or lookup failure is an explicit error, never a default limit. Definite name-capacity refusal has a distinct OSError-compatible exception so upload can return400 without remapping unrelated IO failures. Office retains its existing exception/finally/obligation behavior; do not introduce a new Office status or journal format.

Must preserve: short names and Path's last-suffix definition, original-first upload semantics, atomic no-replace winner selection, symlink/foreign entry preservation, EXDEV and unrelated IO behavior, attachment receipt binding, actual stored-name response, Office indexed-name exclusion, existing candidate-count bound, fence ownership, private witnesses and crash recovery.

Governing invariant: every successful collision publication has complete bytes under a byte-budgeted name, while every pre-existing entry remains untouched and each caller retains truthful publication responsibility on failure.

Sibling surfaces: upload publication, explicit Office resolve/save-as, automatic final-callback copy, and owned-copy recovery after a claim but before returned-name persistence. Existing claimed names are not renamed during recovery.

## Verification sequence

1. Fixture review and strict validation; retain the observed HTTP500 counterexample.
2. Add behavior regressions in existing owning tests first; parent runs newly introduced boundary cases RED before production edits.
3. Implement the shared formatter/error boundary and migrate both consumers atomically; no parallel algorithm.
4. Parent verifies legal free names, ASCII/multibyte bounds, longest-prefix/fallback, suffix refusal, unknown-limit failure,9→10, races/no-overwrite and full bytes. Exercise real Office copy and failure/recovery paths, not only a helper mock.
5. Run owning upload/Office suites and native HTTP smoke; update owning documentation; expanded cross-review and exact-head local CI before paired merge/archive.

## Risks and containment

Filename capacity is measured from the actual pinned target directory, not Python character length or a source/staging directory. Fault-injected limits are refusal controls, not replacements for native filesystem boundary cases. Unknown-limit IO failures remain server errors; only definite naming refusal maps to400.

Office must compute its bounded candidate before lstat and journal attempt persistence. Keep existing post-claim fallback cleanup and ownership scans; shortening a stem must not change file_id, version, receipt or journal authority. Unexpected refusal retains saved content and the existing recoverable obligation, rather than claiming success or deleting unproven entries.

No data migration: existing files and receipts are untouched. Rollback reverts the source change; already stored names remain valid, and recovery must continue honoring proven owned copies independently of spelling. No sandbox image rebuild or LAN deployment is required for this server-side naming change.
