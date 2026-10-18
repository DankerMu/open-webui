# Design

## Context

Full collection with only the two direct receipt branches passes. Either first file-response case or first active-content header case before those branches produces the exact nominal-class failure. Read-only tracing starts with coherent imports, observes each fixture remove the cached descriptor module while retaining uploads, then observes app import create a new descriptor/class object. The emitted close-only exception belongs to the producer's old class; the test imports the new class. Neither fixture restores entry modules.

## Goals / Non-Goals

- Invariant: within each repaired fixture, app/file-response/receipt consumers share the active receipt descriptor class; after fixture exit, every module-cache entry owned by that fixture has exactly its entry object or entry absence.
- Cleanup applies after normal body completion, a real pytest body failure, and setup failure after module eviction. Original errors remain observable.
- Preserve the entire direct receipt oracle: nominal class, original primary/cause identity, resource, committed state, close_errors, one close attempt, retired FD, complete receipt and no temporary entries. Preserve all existing response/header/Office safety assertions.
- No production classification change, target-local reload, duck typing, forced ordering, subprocess isolation substitute, skipped test, dependency change or broad fixture cleanup campaign. Other owners and #507 remain out of scope unless this repair introduces a demonstrated regression.

## Decisions

- Repair both proven owners, not the downstream receipt test. Adding only a target reload would conceal the pollution; restoring only descriptor_io would leave fixture-local app consumers incoherent.
- Extend the owners' existing eviction family with the missing coupled uploads module. Snapshot before eviction, use guaranteed cleanup covering imports/setup and yield, remove test-created replacements, then restore original objects. Preserve the existing environment and caller-facing fixture outputs.
- Reuse existing snapshot/retire/restore conventions from `upload_server`. Its HTTP client/environment behavior and the outputs `_isolated_app` helper's cache mutations are not reusable for these fixtures. Avoid a general registry/framework; any shared helper must be limited to these two owners and covered by their actual fixture regressions.
- Audit direct descriptor consumers in app, uploads, file_response, docker_manager and outputs_broker; audit unchanged Office cached references for new regressions without expanding unrelated module ownership by assumption.
- Parent executes diagnostics and acceptance; one implementer writes permanent test code. An actual production defect requires a separate scope decision.

## Verification

- Preserve exact commands and IDs for both independent minimal predecessor sequences and target-only control. Record module/class identities at entry, first split and target exception; no exception messages or environment contents in tracing.
- Add one semantic failing fixture regression before repair, then prove restoration; cover both owners and present/absent entry boundaries. Use actual pytest finalizer semantics, not invented generator.throw test-body behavior.
- Inject setup failure after eviction and a real pytest test-body failure as bounded probes; ensure cleanup and original error identity, with a subsequent real receipt consumer passing.
- Run complete affected owner modules plus the complete upload-claim module, then unfiltered qualified full-root against retained unchanged runtime images. Record all node outcomes, skips, package checks, source hashes and exact owned-resource cleanup.

## Risks / Trade-offs

- App imports have coupled cached consumers → verify fixture-local coherence and post-exit caller identity, not only final target success.
- A helper can introduce collection-order coupling → retain root importlib collection and do not change conftest/path policy.
- Trace overhead may perturb execution → retain uninstrumented minimal RED/GREEN; trace is read-only.
- Test-only repair has no deployment migration. Rollback is a revert of the fixture/support changes; no production data or release state changes.
