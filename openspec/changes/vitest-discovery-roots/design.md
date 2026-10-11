# Frontend test discovery boundary

## Context

See proposal.md. The tracked inventory contains suites only under `src/` and `scripts/`; helpers under `test/` are not suites.
The reported `.run/local-test` and `.run/vps-test` directories are absent in this checkout. Their historical failure is accepted, not rerun for confirmation.

## Decisions

Change surface: the Vitest-only branch of `vite.config.ts`.
Use explicit root-relative include patterns with the installed Vitest default filename grammar.
A `.run/**` denylist leaves other unrelated snapshot roots discoverable; per-entrypoint flags can drift.
Must preserve: all tracked suites, supported test/spec extensions, default exclusions, Svelte browser conditions and inline dependencies.
Governing invariant: every official suite is discoverable while suites outside the approved roots are not.
Sibling surfaces: `make test-frontend`, `npm run test:frontend`, and `scripts/coverage-gate.sh`.
Seams under test: actual Vitest discovery and CLI execution, not source-text assertions.

## Evidence

Freeze tracked suite paths independently before editing; compare discovered paths and executed suite paths against that inventory.
Use uniquely owned witness directories under `.run/` with nested local-test/vps-test build layouts and another unrelated root; never mutate the user's named snapshots.
A throwaway discovery probe must reject the original configuration for selecting those witnesses, then accept the candidate with every official suite retained.
Witness suites fail if executed. Run real Make and npm entrypoints with witnesses present; expect all official suites to pass and witnesses absent.
Check coverage consumer discovery with its actual `--exclude e2e/**` override; do not change coverage policy.
Record named-snapshot presence/metadata before and after; claim no preserved-content execution evidence for snapshots absent here.

## Risks / Trade-offs

New official roots require an explicit policy update; test filename families within approved roots remain supported.
The allowlist is a directory policy, not a Git-index-only filter: uncommitted developer tests inside approved roots remain discoverable.
No production UI/runtime, dependency, coverage threshold or snapshot-producer changes.
Rollback is reverting the configuration commit; no stored user data is migrated.
Review focus: omitted suites; entrypoint divergence; copied tests escaping the boundary; snapshot ownership.
