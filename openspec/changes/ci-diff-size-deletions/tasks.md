# Tasks

## 1. Counter correction

- [x] 1.1 Add one real-Git/extracted-workflow deletion401 regression and focused Make target; parent observes semantic RED without rerunning the reported historical deletion observation.
- [x] 1.2 Add statusD only to the guard filter; parent verifies deletion400/401, mixed401, in-file deletion, exclusions at the400boundary and whitespace handling through focused Vitest tests.

## 2. Acceptance and delivery

- [x] 2.1 Parent executes the actual guard and reused bounded label-expression model on disposable Git fixtures; verify deletion counts/verdicts, absent/present/removed/unrelated labels, approved-edit-only workflow preservation and owned cleanup.
- [ ] 2.2 Refresh the existing CI decision's stale deletion paragraph, explicitly flag the CI edit in the PR, pass scoped lint/format/doc/decision and strict fixture checks, complete expanded review/exact-head local CI, then merge and archive.

## Risk coverage

- CI/script/config — selected: actual workflow run block, BASE_SHA and threshold; all other workflow semantics unchanged.
- Legacy compatibility — selected:400boundary, mixed/modified deletions, exclusions, whitespace and existing label policy; #262 subscription/aggregate unchanged.
- Error handling — selected: oversized unexempted diff exits nonzero; no swallowed guard failure or missing-tool pass.
- Documentation — selected: update stale active record, preserve archived evidence; no new architecture decision for one localized filter correction.
- File IO/resource — test-only owned Git repositories and extracted programs; remove them without touching user repo data. No production allocation change.
- Schema/auth/secrets/concurrency/dependencies/release — not selected; no changed behavior or permissions. Hosted Actions dispatch remains outside local replay evidence.

Baseline: `/tmp/issue401-replay-baseline.json` records9 synthetic replay rows, including deletion401 counted0/passed and mixed200deletion+201addition counted201/passed. Current label conditions, workflow/constraints preservation and owned cleanup were observed. `/tmp/issue401-permanent-red.json` records the new executable regression failing because observed count0 differs from expected401.

Fixed evidence: `/tmp/issue401-focused-green.json` records6passing real-Git/workflow cases; `/tmp/issue401-replay-fixed.json` records9passing local replay rows. Deletion400 counts400/passes, deletion401 and mixed401 fail, excluded/whitespace boundary cases pass, and the exemption remains event-snapshot-controlled. Full explanatory/annotation wording assertions were replaced with numeric count/limit and exit-status assertions; the401expectation was retained.

Durable bundle: `docs/evidence/issue-401/verification.json.gz`. An additional9fixed rows passed with Bash `-e` without explicit pipefail; strict-mode results remain separate. Full frontend suite passed505tests/35files, including the6final guard cases. Scoped lint133files, docs/55decision records and repaired Prettier checks passed; the existing pluginSearchDirs warning is unchanged. Independent review and exact-head CI remain pending.
