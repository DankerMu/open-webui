# ocu-pytest-discovery Specification

## Purpose

Preserve the intended OCU selected-test scope and fixture ownership when verification combines root-level and orchestrator tests, without changing fixtures or dependency policy.

## Requirements

### Requirement: Canonical selected pytest discovery

OCU verification guidance SHALL use `tests/` as the single collection root for selections combining root-level and orchestrator tests, with an equivalent module-name `-k` filter, `--import-mode=importlib` and the intended integration exclusion. A changed invocation SHALL be qualified by exact selected node-ID equality, not equal counts alone. Canonical collection SHALL resolve the existing `world` fixture for selected consumers without a fixture/conftest patch or pytest dependency-policy change. Collection and full test execution SHALL be recorded separately; collection success SHALL NOT be described as tests passing.

#### Scenario: Historical selection is preserved

- **WHEN** the recorded sixteen-module selection is compared on source `d670ce86af53fa1c4636a55875e7d4b72ae53ff0` under pytest 9.1.1
- **THEN** explicit-path and canonical-root collection contain exactly the same 864 unique node IDs, and canonical selected consumers resolve `world`
- **AND** the canonical full selected execution has a separate recorded exit and outcome, with its actual environment identified

#### Scenario: Current test growth is retained

- **WHEN** the same intended module selection is qualified on a later source revision
- **THEN** its explicit-path and canonical-root node-ID sets remain equal without deleting or filtering new cases to reproduce the historical count
- **AND** the record identifies that revision and its actual selected count, not a claim that every revision has 864 cases

#### Scenario: Guidance does not patch the fixture boundary

- **WHEN** a maintainer follows the documented canonical command
- **THEN** existing fixture definitions, conftest ownership, test assertions, production behavior and pytest dependency policy remain unchanged
- **AND** a full-suite or selected-suite success claim names the executed scope and result separately from collect-only observations

### Requirement: Integration helpers survive full-root discovery

OCU integration tests SHALL resolve their shared MCP request and response helpers independently of which other suite's conftest was loaded first. Canonical full `tests/` discovery and focused integration discovery with `--import-mode=importlib`, and the documented console `pytest tests/integration/` entrypoint with default prepend imports and no PYTHONPATH override, SHALL retain the same integration test node IDs, assertions and fixture ownership. The change SHALL NOT use skips, test removal, global conftest aliases, path-order overrides or dependency changes to obtain collection success.

#### Scenario: Deploy and integration suites are collected together

- **WHEN** the full `tests/` tree is collected using importlib mode
- **THEN** every integration module resolves its own MCP helper implementation without importing helpers from the deploy conftest
- **AND** the integration node-ID set is identical to focused integration collection after normalizing only the rootdir-dependent `tests/integration/` prefix to integration-relative paths, retaining every test/parameter suffix

#### Scenario: Documented console invocation remains supported

- **WHEN** the console executable runs `pytest tests/integration/` from the checkout root without a PYTHONPATH override
- **THEN** collection succeeds with exactly the same raw node IDs as the pre-repair console invocation, and the same integration-relative IDs as full-root importlib discovery under the prefix normalization above
- **AND** real integration execution retains the existing assertions and fixture ownership

#### Scenario: Focused integration execution remains real

- **WHEN** the unchanged integration suite runs against an isolated real server and the full sandbox image
- **THEN** it exercises the same credential, MCP-tool and workspace lifecycle assertions as before the import repair
- **AND** collection success is reported separately from runtime results, including any failed or skipped cases

### Requirement: Main CI executes upload and tool-consumer regressions

The main build workflow SHALL automatically execute both complete current `tests/test_upload_claim.py` and `tests/test_tools.py` modules for pull requests targeting main and pushes to main. Their pytest invocation SHALL remain separate from the explicit orchestrator selection. A failure in either module SHALL fail the owning CI job; successful collection alone SHALL NOT count as execution evidence. Existing integration behavior and issue199's independent scoped acceptance SHALL remain unchanged.

#### Scenario: Main pull request or push

- **WHEN** the main workflow's non-image pytest job runs for either supported main event
- **THEN** it executes every test in both root modules without a filtering expression or skipped module
- **AND** existing orchestrator, auth-guard and deploy verification remains selected

#### Scenario: Either module fails

- **WHEN** an executed test in either root module fails
- **THEN** the pytest invocation and owning job fail, without swallowed status or continue-on-error

#### Scenario: Collection boundaries remain distinct

- **WHEN** the workflow invokes the root-module tests
- **THEN** that invocation does not mix explicit orchestrator paths into the same pytest collection
- **AND** the existing integration job, dependency installation and main event triggers remain unchanged

#### Scenario: Evidence identifies executed scope

- **WHEN** local or hosted CI evidence is reported for this coverage change
- **THEN** it records actual execution of both complete modules, their exact node inventory and failure-propagation controls separately from collection
- **AND** local step execution is not described as hosted Ubuntu or full-root certification

### Requirement: Recovery fake environment is test scoped

Recovery database tests SHALL use their fake Docker environment during execution and restore the complete pre-test process environment after normal completion, a test-body exception, or setup failure after mutation. Later bare Docker subprocesses SHALL inherit their own integration environment. Existing deploy behavior and real workspace integration assertions SHALL remain enabled and unchanged; executable overrides, fake-parser expansion, test filtering and skips SHALL NOT substitute for restoration.

#### Scenario: Normal recovery completion

- **WHEN** a recovery database test completes successfully with fake Docker active
- **THEN** overwritten environment values are restored and keys absent at entry remain absent afterward
- **AND** the complete environment equals the pre-test snapshot

#### Scenario: Recovery body raises

- **WHEN** a recovery test body raises after fake environment activation
- **THEN** the test error remains observable and the complete pre-test environment is restored

#### Scenario: Recovery setup raises

- **WHEN** setup raises after fake environment activation and before the test body runs
- **THEN** the setup error remains observable and the complete pre-test environment is restored without requiring normal teardown

#### Scenario: Later integration inspection

- **WHEN** canonical root execution runs recovery tests before real workspace integration tests
- **THEN** subsequent bare Docker inspection uses the integration executable rather than the deploy fake
- **AND** the five workspace lifecycle cases execute with their unchanged real-engine assertions, with failures and skips reported separately from scoped success

### Requirement: Office sweep safety probe survives execution ordering

The Office sweep lifecycle-lock safety test SHALL preserve its real precheck, canary swap and positive lock-attempt observation under bounded and canonical full-root execution. Test-owned module state SHALL NOT redirect admission to a stale manager or otherwise suppress the tested path. Repairs SHALL preserve all existing assertions that the canary is neither opened nor flocked and that its bytes, inode, mode and directory entries remain unchanged. Production admission and lock semantics SHALL remain unchanged.

#### Scenario: A preceding test changes module state

- **WHEN** the minimized same-process predecessor sequence runs before the sweep safety probe
- **THEN** the probe observes a real lifecycle-lock path-open after the successful precheck and canary swap
- **AND** all canary preservation assertions remain active and pass

#### Scenario: Canonical execution exercises the safety boundary

- **WHEN** the unfiltered tests root executes with importlib mode in a qualified environment
- **THEN** the sweep safety probe completes with positive lock reachability and canary exclusion evidence
- **AND** every unrelated failure or skip is reported separately rather than converted into a full-suite success claim

#### Scenario: Diagnosis preserves confidentiality and oracle integrity

- **WHEN** execution fails between the precheck and lock opening
- **THEN** evidence identifies the admission result, exception class, relevant module identities and flock depth without exception text or credentials
- **AND** no skip, manufactured admission success, weakened assertion or production-lock change substitutes for fixing the established test owner

### Requirement: Receipt classification survives file-route fixture ordering

File-route verification fixtures SHALL preserve coherent receipt exception identity during execution and restore their owned module-cache entries to the exact entry objects or entry absence afterward. The direct receipt cleanup verification SHALL retain nominal exception classification and every existing committed-write, primary-error, cause, descriptor-retirement and complete-receipt assertion. Production classification SHALL remain unchanged.

#### Scenario: Either file-route fixture precedes receipt cleanup

- **WHEN** either independently minimized file-response or header predecessor runs before both receipt cleanup branches in one process
- **THEN** the receipt writer and test observe the same descriptor exception class
- **AND** both close-only and sync-and-close branches pass all original assertions

#### Scenario: Fixture exits after success or failure

- **WHEN** an affected fixture completes normally, its test body raises, or setup raises after owned module eviction
- **THEN** owned entry module objects and prior absence are restored without leaking replacement modules
- **AND** the original failure remains observable and a later receipt consumer uses a coherent module family

#### Scenario: Canonical full-root verification

- **WHEN** the unfiltered tests root runs with importlib mode in the qualified runtime environment
- **THEN** both receipt cleanup branches pass without reloads or weakened nominal assertions in the target
- **AND** discovered and executed nodes, skips and unrelated failures are reported explicitly rather than filtered into a success claim

### Requirement: Orchestrator CI resolves the checkout namespace

The orchestrator CI invocation SHALL make the repository checkout root importable for its package-qualified fixture imports without a manually supplied PYTHONPATH. It SHALL execute the complete existing orchestrator selection, retain default import semantics and failure propagation, and leave other job commands, dependencies, environment and test fixtures unchanged.

#### Scenario: Declared Python workflow environment

- **WHEN** the orchestrator step runs from the checkout root with Python3.13 and its declared job dependencies
- **THEN** repository-qualified fixture imports resolve and the orchestrator tests execute rather than stopping before collection
- **AND** the selected raw node IDs equal the intended orchestrator subset in the same environment

#### Scenario: Verification distinguishes collection and execution

- **WHEN** evidence is published for the entrypoint correction
- **THEN** it records exact commands, interpreter/dependency/environment identities, collection inventory and complete execution outcomes separately
- **AND** failures and skips remain explicit, with local container evidence not described as a hosted-runner or native-Linux acceptance receipt
