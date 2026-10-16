# Design

## Context

See [proposal](proposal.md) for the failure and authorization. The original B1 base is the immutable ONLYOFFICE 9.4.0 OCI index. Its normal desktop bootstrap is SDK/Backbone/core, locale application, then asynchronously loaded controllers and views. Service Worker responses do not establish sibling AMD factory order.

The related-tree audit identified 87 potentially ordering-sensitive UI uses involving BaseView, Window or DataViewItem; this is a candidate inventory, not proof of 87 independent defects. Effective BaseView delay exposes three native failures, and Window delay separately fails `ExtendedColorDialog` even with BaseView initialized. DataView delay reaches a healthy XLSX editor, so it does not justify another provider change.

Existing delivery already has source-built roles, selected-commit build contexts, configuration-digest content references, archive validation and fail-closed startup. DocumentServer is the remaining special pulled role. The local verifier follows the Docker engine architecture; deployment release construction remains linux/amd64. Those are distinct outputs, not interchangeable digests.

## Goals / Non-Goals

- Establish a real AMD dependency barrier for the three desktop editor applications and confine the image change to that ordering contract.
- Use one tracked recipe and one selected-source qualification declaration. Preserve original base images and all historical B1 evidence.
- Do not modify server binaries, SDK logic, component behavior, fonts, authentication, sandbox/permissions, Service Worker behavior, retry/reload policy or timeout values.
- Do not add a registry/publication system, another release builder, a LAN rollout or acceptance of #197's other image work. Mobile and arbitrary standalone use of internal UI modules gain no new certification.

## Decisions

### Native bootstrap barrier, not cache preloading

Patch only `apps/{documenteditor,spreadsheeteditor,presentationeditor}/main/app.js` in the image. Inside each existing locale-ready callback, require the native `common/main/lib/component/Window` provider before requesting the existing controller/view dependency group. Window already declares its BaseView dependency. The callback therefore establishes both confirmed missing prerequisites before those consumers can execute. Leave DataView ordering unchanged; its controlled baseline remains healthy.

The barrier belongs after locale application and the first bootstrap callback's `window._` publication. Adding the providers to the initial SDK/core dependency array would risk executing them before the underscore global and locale overrides exist. Preserve the original controller callback, app-start sequence and error handling; do not reorder the application by speculative sleeps.

Alternatives: per-consumer declarations are locally correct but spread the same ordering repair over dozens of vendor files; a shared native bootstrap dependency barrier is smaller and matches the existing global-framework bootstrap pattern. Host preloading, Service Worker bypass and a delay are rejected because they establish no dependency guarantee. Internal UI modules used outside these supported editor entrypoints are not made into a new standalone API.

### Hash-bound build inputs and confined mutation

OCU owns `deploy/documentserver/` as the build context: a Dockerfile pinned to the original base index, a small patch application entrypoint, exact before/after hashes and literal edit spans for the three entrypoints, and modification/source notices. Freeze all source hashes before implementation. The application step verifies every input and expected output before writing any target. Wrong base bytes, ambiguous edits, missing files or repeated application fail rather than guessing.

Use the base image's installed Python; install no package. Preserve original file ownership, modes and timestamps. Build-only tools must not remain on the runtime filesystem. The final root filesystem may differ only at the three declared JS paths and explicitly declared modification/provenance notice files; retain the base layer chain, entrypoint, command, environment and fonts. Audit the actual image, not only the patcher's report.

### Reuse the seven-role delivery mechanism

Make DocumentServer a built role with the selected committed context. Retain inventory version2, the seven role names, `DOCUMENTSERVER_IMAGE`, font-bundle guarantees and all existing archive/startup/backup binding. Remove its obsolete pulled-default branch and pulled-provenance acceptance. Record the immutable base as build material and reject base overrides that escape the selected recipe. PostgreSQL remains pulled; other roles remain unchanged.

A new consumer refuses an old pulled-DocumentServer inventory before mutation. Do not rewrite an old inventory to claim patched provenance. Rollback uses the retained original image with its matching original source/qualified record; it is not silently accepted as the new derivative.

### Platform-specific qualified identity

Store the qualified build identity declaration outside the Docker build context in the selected OCU source, so recording an output cannot change its own build inputs. Bind it to the Git tree of `deploy/documentserver/` and to the actual output for each supported build platform. Use the existing content-addressed named-image convention; no mutable tag or label alone proves identity.

The WebUI verifier reads that declaration through its existing pinned-commit `git_blob` channel. Remove its independent original-image constant and registry-only RepoDigests rule. Missing platform, stale recipe binding, absent image, wrong architecture or rebound identity must fail before runtime mutation; the target still never builds or pulls implicitly.

Distinguish OCI index, platform-manifest and image-configuration digests explicitly. Docker's containerd store can report a manifest/index in `inspect.Id`; do not label that a configuration digest. Qualified archive/configuration metadata and the matching local platform identity must agree. Reuse existing archive identity logic where needed rather than introduce a competing parser. ARM64 local runtime evidence is not AMD64 deployment certification; record built identity and runtime-tested platform separately.

The declaration contains a recipe-tree ID and a platform-keyed map of the content reference, configuration digest and (when produced) single-platform manifest digest. Obtain the configuration digest from the saved artifact with the existing release archive validator; obtain the manifest identity from the actual build output and verify its configuration binding during qualification. At local preflight, inspect the named reference for the selected platform and require `Id` to equal one of those two qualified immutable identities. An index identity is not accepted. Launch by that checked immutable identity, not by the mutable name. This supports classic and containerd image stores without inventing a configuration digest from `inspect.Id`.

The existing release builder's assumption that every `inspect.Id` is a configuration digest is tracked by [#337](https://github.com/DankerMu/open-webui/issues/337), not expanded into a general engine-compatibility rewrite here. Its existing archive/configuration consistency gate remains mandatory. This change must not certify a release export that fails that gate; platform-specific local image qualification does not claim full seven-role export/import qualification.

### B1 delta qualification

Keep the original B1 record and artifacts immutable. A new record names the base, recipe tree, exact patched output identities, filesystem/layer comparison, retained licence/branding and identified modifications. The operator's derivative approval is recorded without an agent legal opinion.

Re-exercise all three native edit/save/fresh-open paths, close/final callback consumption and timing, callback download origins, force-save userdata, the no-cookie path, native save semantics, and the existing iframe/diagnostic policy. For unchanged server/font/capacity/shutdown facts, record either fresh measurements or explicit inheritance supported by byte identity and the original evidence; do not turn the original observed bounds into stronger claims. Acceptance-machine memory, organisation fonts, LAN deployment and AMD64 runtime remain unmeasured unless actually exercised.

Native readiness includes the pinned entrypoint's cache-generation and core-service restart phase. HTTP health and theme availability alone admitted an editor before that restart and caused connection loss. The local verifier uses the positive PID-1-owned final log-tail phase, then rechecks health within the same readiness budget. It changes neither the image's entrypoint nor the timeout/diagnostic policy. The B1 delta retains the failure boundary and successful stable-core campaign.

## Migration and verification

1. Review this fixture and freeze the three-entry hash-bound patch inventory; retain the 87-site audit and effective dispatch RED/restoration.
2. Implement the recipe and built-role cutover with paired behavioral tests. Verify wrong-source refusal before writes and release provenance/source/cache/identity transitions using the owning deployment inventory.
3. Build only the authorized DocumentServer derivative. Inspect actual layers/files/configuration and record platform-specific output identities outside the build context.
4. Migrate local identity consumption, qualify mismatch/absence refusals, then run delayed-provider controls on the actual patched image. Controllers must remain unrequested until providers resolve, and the original native error must disappear without suppression.
5. Run the complete default three-format target with independent LibreOffice, content/fidelity and resource checks; qualify the B1 delta. Update live pending Office contracts and decisions without mixing unrelated paused #172 edits into this change.
6. High-risk cross-review, exact-head local CI, paired repository PRs and normal merge/archive. #172 keeps its own final acceptance/review obligation; no full release or LAN acceptance follows from this source/image repair.

The local verifier scripts are untracked pending #172 implementation. Their identity migration and runtime evidence are required here, but their source remains in the paused #172 change for its own review and delivery; this companion PR does not absorb those files. Preserve the pre-migration snapshots and publish the exact verifier source fingerprint with qualification evidence. Shared tracked Office-contract files require issue-specific staged hunks rather than staging the entire paused working tree.

## Risks / Trade-offs

- Early UI initialization can disturb globals or localization → place the barrier inside the existing locale callback; inspect provider dependencies and exercise all three real editors.
- A patch silently targets different upstream bytes → exact before/after hashes, zero-fuzz literal edits and image-level footprint checks.
- Image identity domains differ across stores/platforms → typed recorded digests, archive/configuration agreement and actual mismatch controls.
- Historical B1 observations overstate derivative qualification → an explicit per-item disposition and unchanged-byte proof, not a copied go verdict.
- The parent verifier is still uncommitted #172 work → snapshot its inputs, separate staged changes by issue and keep its full target/review pending until genuinely satisfied.
