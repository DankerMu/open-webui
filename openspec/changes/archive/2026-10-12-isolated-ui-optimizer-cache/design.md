# Design

## Context

See proposal.md. Vite's live optimizer metadata and transformed module cache can outlive files replaced by another frontend process. For a relative chunk absent from that live metadata, import rewriting inherits its importer's URL query; different importers can evaluate the same registration body twice against one known registry.

The reduced probe uses installed Vite/Tiptap/ProseMirror, two real servers and fresh browser pages: lazy discovery first, a second generation with an additional direct tables entry, then invalidation of the reused first graph. Both cold pages and the cached first graph pass; the invalidated shared-cache graph raises duplicate `cell`. Separate caches pass every stage. This is a deterministic mechanism replay, not a claim that every isolated harness run reproduces the original timing.

## Goals and boundaries

Governing invariant: a browser-verification run owns all mutable optimizer files it writes and cannot replace the dependency generation of a separately running frontend.

Preserve the default frontend's cache, source/dependency versions, application state, existing service/pid ownership and cleanup, baseline selectors, A-T01/A-T10 and Office cases. Exclude watcher/full-reload changes, forced default-service restarts, dependency deduplication/upgrades, exception suppression, retries, timeout increases and deployment claims.

Sibling surfaces: the default `dev-bg` frontend, owned `verify-ui-ocu` frontend, SvelteKit output isolation, existing scratch cleanup, Vite configuration loading and baseline Playwright discovery. Vitest/shared generated-file watcher behavior is not silently included in this fix.

## Decisions

- Add `OCU_UI_VITE_CACHE_DIR` to the owned harness's curated environment, pointing beneath that run's existing scratch. Select it only for `OCU_UI_PROXY_HARNESS=true`; fail before startup if it is missing or empty. Default and non-harness callers retain the existing Vite cache policy.
- Reuse existing scratch removal rather than adding a second cache lifecycle. Do not delete, clear or migrate the default `node_modules/.vite` cache.
- Add `e2e/vite-cache.e2e.ts`, covered by existing baseline discovery. Load the actual `vite.config.ts` for default and harness environments, restoring environment state; consume its cache policy in a disposable minimal real-Vite browser fixture. Use a real local `node_modules` directory with dependency symlinks, never a whole-directory symlink that redirects the default cache into the checkout.
- The regression uses real library evaluation and visible completion/error state. It exercises cold first/second generations and a reused invalidated first graph, with an extra direct `prosemirror-tables` entry forcing a different real chunk layout. No copied cache-policy helper, source-text assertion, mock registration or guard replacement. Diagnostic registration instrumentation stays outside the permanent regression.
- Require parent-observed regression RED before the configuration change, then GREEN. Test teardown closes pages/servers and removes only its owned temporary root on success or failure; explicit free ports avoid Vite's `port: 0` fallback. Canonicalize macOS temporary paths before passing them to Vite.

## Evidence and risks

Retain original failed-route URL identities and actual reduced first/second registration events; never publish authenticated raw traces. Keep the negative harness-only/Vitest/HMR controls and the probe's setup failure distinct from reproduction evidence. The bogus-query HTTP-status discriminator is invalid for the installed Vite loader and is not used as proof.

Parent verification: real configured regression RED/GREEN, `make verify-ui`, then the unchanged baseline against the still-running default service; frontend tests, scoped lint, type ratchet, named harness static checks, docs/decisions, strict OpenSpec and scoped formatting. Check that real harness cache paths are owned and removed, and that the default cache identity is unchanged across the isolated run. New cache setup failure must be explicit, not default-cache fallback.

## Rollback

No stored-state migration or compatibility path. Revert the configuration/harness commit; do not leave an alias or default-cache clearing workaround. Cold recovery alone is not accepted as a root-cause repair. The pre-#153 shared-runtime structure is source-history evidence, not attribution of the exact first failed execution.
