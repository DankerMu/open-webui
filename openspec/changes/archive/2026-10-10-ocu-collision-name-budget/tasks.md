## 1. Contract and RED

- [x] 1.1 Independent expanded fixture review and strict OpenSpec validation pass before production edits; caller inventory includes uploads and current Office save-as/recovery.
- [x] 1.2 Reproduce native upload failure: first legal target-NAME_MAX ASCII name returns200 unchanged; second complete payload receives500/ENAMETOOLONG instead of a bounded successful collision name.
- [x] 1.3 Add owning behavior regressions first, then parent runs uncertain byte-boundary/refusal/Office cases RED against unchanged production code. Agents run no checks mid-flight.

## 2. Single naming owner and atomic consumers

- [x] 2.1 Implement one encoded-byte collision formatter in `uploads.py`, queried through the target directory fd, preserving Path's last-suffix semantics and longest whole-character prefix; verify original-first/free names, short names, multibyte names,9→10 and `_` fallback.
- [x] 2.2 Use that formatter in the existing atomic claim retry and Office numbered candidate loop before lstat/journal attempt persistence. Preserve the existing Office candidate cap, indexed-name exclusion, raced fallback cleanup and identity-based recovery; remove duplicated candidate assembly.
- [x] 2.3 Distinguish definite capacity refusal from other IO failures and map only that upload failure to HTTP400. Verify impossible suffixes preserve the original, publish no second file or receipt, and remove private upload staging. Indeterminate/failed NAME_MAX lookup must fail explicitly without255 fallback.

## 3. Consumer and runtime proof

- [x] 3.1 Exercise actual target-filesystem limits for legal free names at252–255 bytes where supported, ASCII and multibyte collisions, exact longest prefix, number-width transition and minimal-stem fallback. Fault-injected capacity/query failures are additional controls, not substitutes for native filesystem evidence.
- [x] 3.2 Prove bounded candidates remain atomic no-replace claims against an unlocked concurrent winner and occupied symlink; returned stored names identify each full payload and every prior entry/target is unchanged.
- [x] 3.3 Exercise actual Office explicit save-as and automatic final-copy consumers with near-limit names; retain version/session/file_id/receipt semantics and prove interrupted shortened-name claim recovery completes one owned copy. Exercise shared naming failure through the Office caller, retaining saved content and existing cleanup/recovery responsibility.
- [x] 3.4 Run owning `tests/test_upload_claim.py`, `tests/orchestrator/test_office_save_as.py`, and `tests/orchestrator/test_office_resolution.py` suites plus changed upload/auth error-path coverage. Run a disposable real HTTP server smoke of first/second upload and capacity refusal; observe bytes, actual names, receipts and cleanup. No UI, image or LAN claim.

## 4. Documentation and delivery

- [x] 4.1 Update the owning workspace-files decision and source changelog after runtime proof. Run central docs/decision gates and strict spec validation; verify no archived decision/change was modified.
- [x] 4.2 Expanded correctness, test-evidence/spec-compliance and invariant-state cross-review close at the frozen source head; publish exact-head scoped local CI and complete reports.
- [x] 4.3 Merge source and central fixture, close the issue, and archive the independent change into its shared naming capability.

## Risk packs

Selected: public API — upload400 and actual stored-name responses (2.3,3.4); file IO/path safety/no-overwrite — borrowed destination descriptor, atomic claims, symlinks and retained bytes (2.1–2.2,3.2); resource limits — actual encoded-byte NAME_MAX, growing numbers and explicit refusal (2.1,2.3,3.1); concurrency/shared state — concurrent winners plus Office witness/journal identity (3.2–3.3); legacy compatibility — free originals, short names, last suffix and existing claimed-copy recovery (2.1–2.2,3.3); error handling/rollback/partial output — staging cleanup, no false receipt/success and Office responsibility (2.3,3.3–3.4); documentation — owning decision and changelog (4.1).

Not selected: auth/secrets — existing guards unchanged, no credentials added; schema/columns/field names — no persisted schema change; config/project setup and release/dependency compatibility — no dependency, image, environment toggle or deployment change. Upload size, archive staging exclusion and unrelated Office recovery defects retain their separate owners.
