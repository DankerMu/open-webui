# Proposal

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; shared runtime configuration and mutable optimizer state require expanded review.
Blast radius: local default-page rendering and owned browser verification.
Selected risk packs: script entry, configuration, file ownership, concurrency, compatibility, errors, documentation.
Evidence floor: causal real-Vite RED/GREEN, production-config browser regression, unchanged baseline and OCU browser acceptance, scoped configuration/harness checks.

## Why

The default frontend and owned browser harness write one dependency-optimizer directory. A captured default-page failure loaded one table-registration chunk under two URL identities; a reduced real-Vite/real-ProseMirror experiment reproduces the duplicate registration after another optimizer generation replaces the shared files and the reused graph is invalidated. Giving the second instance its own cache removes that failure without changing dependencies or the registration guard.

## What Changes

- Give the owned browser frontend a required cache directory beneath its existing private scratch; preserve the default frontend's existing cache policy.
- Keep a behavioral browser regression that loads the actual Vite configuration and exercises two real optimizer generations, rather than asserting copied configuration values.
- Retain the failed full-route evidence, negative trigger controls, observed first/second registrations, source-history limits and paired isolation counterfactual; document the cache owner.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-workspace-files`: extend executable browser proof so owned frontend compilation state cannot corrupt a reused default frontend.

## Impact

`vite.config.ts`, `scripts/verify-ui-ocu.py`, a focused baseline Playwright regression and a testing decision. No lockfile, package version, editor behavior, generated-content authority, default-route assertion, retry or timeout change. The shared two-server structure predates #153; no introducing-causality claim against Office editing is made.
