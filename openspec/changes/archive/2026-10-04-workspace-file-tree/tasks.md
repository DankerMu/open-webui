# Tasks

## 1. Tree presentation

- [x] 1.1 Render existing workspace-file-rows output with local expanded/collapsed groups, kind icons, original accessible file names, full-name tooltip, canonical formatted sizes and visible selected/hover/focus states. A new component test file covers nested/flat listings, all kind choices, size, request-free collapse/expand, panel/chat reset, the selected row's `aria-pressed=true` and visible selected style hook, same selection callback, selected Office re-click, and More files presence/busy behavior. Capture semantic RED before production changes; keep old tests/selectors unchanged.
- [x] 1.2 Bound list scrolling to about40% panel height with a selection and available height without one. Verify actual browser geometry plus screenshot fit; no header/selected-file/frame-policy change. Generate strings with npm run i18n:parse; no hand-edited locale values. Update existing workspace plan/owning decision after smoke.

## 2. Fixture and browser evidence

- [x] 2.1 Add exactly one nested scenario to the existing stub mechanism and verify-ui-ocu SCENARIOS. Include at least two directories, a three-level directory and root files spanning distinct known kinds, with varied deterministic sizes. Preserve every old scenario/listing. Nested selected files must have deterministic bytes at their advertised URLs; verify with HTTP assertions, not a listing-only fiction. Existing FILES_RE already captures nested paths; do not widen production routing. make smoke-stub passes.
- [x] 2.2 Add one discoverable browser case asserting headers/indentation/collapse/expand/selection and list-height behavior; capture dark/light tree PNGs in .run/ui-evidence and attach durable images to PR. Run make verify-ui (includes the OCU suite), including A-T01 and all existing cases unchanged, with zero unexpected console/page errors. Inspect both actual screenshots.
- [x] 2.3 Run focused new/existing component and row-model tests, per-file coverage, lint-scoped/typecheck/anti-drift and strict OpenSpec/doc/decision gates. Exact-head clean CI proves full frontend/coverage if known #219 local user-owned .run copies interfere; copies and discovery remain untouched.

## Risk Coverage

UI/names/schema:1.1 protects list name Workspace file list, original file button names, Folder-prefixed expanded headers and More files; metadata/icons cannot pollute names. Local state/identity:1.1 verifies collapse has no network/selection effect and resets with panel/chat lifetime. Compatibility/partial output:1.1/1.2 preserve selection, Office re-click, pagination, reconciliation and iframe contracts;2.2 preserves A-T01. Fixture paths/errors:2.1 proves advertised nested bytes and unchanged old scenarios; real browser diagnostics stay strict. Docs:1.2 and2.3 retain live owning documentation and generated strings.

No new auth policy, storage, dependency, quota, deployment or model behavior. Known #239 TSV classification and #95 native-popup observer intermittency remain separate; no test suppression, artificial retry policy or timeout increase.

The stub is800lines, existing component test796 and workspace browser spec794. Never exceed limits or compress unrelated code. The existing Office scenario frozenset can replace the duplicate Office scenario-name inventory when making room for the new scenario, preserving office_save_as's explicit empty listing override. Prefer a configured spec with space or explicitly add a new spec to testMatch. Shared scenario lists are serialized by the authorized DAG; Office consumers land later.
