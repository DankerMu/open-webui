# Design

## Context

The qualified full-root receipt from issue #444 reproduces the missing lock attempt. Full-root collection with only the target selected passes; the target plus `test_cli_runtime.py::test_unset_subagent_cli_resolves_to_claude` fails in 1.81s. The CLI fixture removes its entry manager from the module cache without restoring it. The sweep reload binds a new manager, while admission retains the old manager and yields None from its missing data root; both observed flock depths are zero.

## Goals / Non-Goals

- Governing invariant: the sweep safety probe must reach a real lifecycle-lock path-open after its real precheck/canary swap, while all canary preservation checks remain active.
- Preserve the existing single-invocation reachability-plus-safety proof, real admission and real lock path.
- Non-goals: production changes; injecting successful admission; manually clearing production lock state as a workaround; skipping/reordering the acceptance suite; relaxing the oracle; repairing #504 here.

## Decisions

- Diagnose before selecting a fixture repair. Use an external read-only trace and exact-node prefix minimization; do not expose exception text, persisted state or credentials.
- Ranked hypotheses: stale admission-manager binding yields missing-root admission; a caught pre-lock exception ends the visit; retained flock depth bypasses opening. Record module IDs and branch outcomes to discriminate them.
- Identify the first predecessor/state change, or prove the failure does not require predecessor leakage. Full collection with one selected target is the initial control, not canonical acceptance.
- Apply the smallest repair to the proven test owner using existing fixture lifecycle conventions. Do not reload or reset unrelated modules merely to make the target green.
- Parent owns executable diagnostics and acceptance; implementer owns permanent test/fixture edits. A new production cause would require a separate scope decision, not an in-scope lock patch.
- Repair `_clean_subagent_env` at that ownership boundary: snapshot its three evicted modules, remove test-created replacements and restore entry objects or entry absence on exit. Do not patch the downstream sweep/admission consumers.
- Remove the owner's redundant source-text injection pin as required by test policy, retaining the adjacent behavioral container-environment regression. This is not the mechanism that fixes the observed RED; disclose it separately.

## Seams and Siblings

- Seams: the current world fixture, sweep precheck, admission yield/exception, combined-lock entry and observed path-open.
- Siblings: all consumers of any changed fixture, its import/teardown lifecycle, cached manager references, and the target's os/io/flock observation hooks.
- Capture test-manager, sweep-manager and admission-manager IDs, admission None/non-None, caught exception class, and active chat flock depth. Omit exception messages and ambient environment contents.

## Evidence

- Preserve the failing qualified full-root receipt and compare the retained bounded 50-case selection, recording its current exact node inventory rather than forcing its historical count.
- A minimized same-process predecessor/target sequence must demonstrate semantic RED, then GREEN with the unchanged positive reachability and canary assertions.
- Canonical full-root after repair must execute the target successfully, including an observed lock attempt and canary exclusion from opened/flocked identities; report unrelated failures separately.
- Changed-fixture consumers must retain their existing behavior; package integrity is checked before/after acceptance, with real owned runtime resources retired exactly.

## Risks / Trade-offs

- Tracing may perturb scheduling → target synchronous branch/module identity facts; retain uninstrumented RED/GREEN confirmation.
- Global module replacement can hide coupled references → audit the proven owner's module family and teardown, not just one symptom.
- No runtime migration; revert only the test-infrastructure repair if needed. No acceptance-machine or release certification follows from this fixture fix.
