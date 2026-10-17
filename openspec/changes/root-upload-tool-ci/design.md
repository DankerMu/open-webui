# Design

## Context

The existing `pytest-orchestrator` job installs server requirements, pytest/pytest-asyncio and pinned PyYAML under Python3.13. It invokes orchestrator pytest, auth-guard pytest and deploy unittest independently. Workflow triggers include main pushes and main-targeting PRs; the integration job is separate. Neither required root module is selected.

Governing invariant: main CI schedules every existing upload/tool-consumer case and cannot report success when either module fails.

Sibling surfaces: workflow triggers/job eligibility, dependency setup, command shell/status propagation, orchestrator/auth/deploy invocations, separate integration job, root-module node discovery and runtime logs.

## Decisions

Insert one distinct pytest command naming both root files into the existing non-image job; reuse its environment and installed dependencies. A command in the current fail-fast run block is sufficient; a new job, dependency install, full-root selector or fixture repair is unnecessary. Keep root and orchestrator pytest processes separate, matching issue339 and the canonical mixed-collection contract.

Parent freezes the pre-change workflow and root-module inventory. A disposable reader derives scheduled pytest paths from the actual workflow and performs collection to demonstrate the baseline omission; collection results are only discovery evidence. After implementation, extract and execute the actual new command, compare its selected/executed nodes with both complete modules, and retain real logs.

For each module, a temporary pytest fault plugin injects one explicit failure without modifying tracked tests. Execute the actual command under the fail-fast shell contract and prove nonzero status plus no subsequent success marker. These are pipeline sensitivity controls, not new permanent wiring tests. No test assertion or workflow failure policy may be weakened.

## Goals / Non-Goals

Preserve every existing workflow job/trigger/dependency, all root test bodies and the integration job byte-for-byte except the narrowly named non-image command/name change. Do not address #444/#445, enable all root tests, change next/v1, or make #199 depend on this CI change.

User-authorized local CI governs this queue. Run the extracted pytest step with declared runtime/dependencies; report actual Python/OS versions. Existing local Python3.13 should be used when its declared dependencies are available; any environment discrepancy is reported rather than misrepresented as hosted proof. Do not enable hosted image builds, deploy or mutate protection rules to obtain evidence.

## Risks and Rollback

- Merely adding a path can still omit/skip cases: compare exact discovered and executed node IDs.
- A false success could mask module failure: inject a real pytest failure independently into each module and observe shell exit.
- Unrelated root-suite failures could expand scope: select exactly the two complete modules in their own process, leaving existing selections unchanged.
- Parser interpretation could alter triggers: verify the YAML event structure with a YAML1.2-compatible interpretation and retain original trigger bytes; no text-only keyword proof.
- Shared OS identity limits verifier isolation: protect oracle by parent-owned hashes and report that it is not an OS enclave.

Rollback is the focused workflow command change; no production or data migration. Merge paired source/control-plane PRs, archive and manually close339 with empty automatic closing sets.
