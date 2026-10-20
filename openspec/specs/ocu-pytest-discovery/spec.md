# ocu-pytest-discovery Specification

## Purpose

Preserve the intended OCU selected-test scope and fixture ownership when verification combines root-level and orchestrator tests, without changing fixtures or dependency policy, run the documented local unit command on the CI interpreter's minor version, restore fixture-owned app modules after auth, WebSocket, startup-warning and alias-map tests, prove the ownership seams through a required reload scope, prefix-owned keys and preserved child-run diagnostics, keep the auth-guard owner's set aligned with the server's local import closure, and keep per-module orchestrator run instructions resolvable from the checkout root.

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

### Requirement: Local unit command matches the CI interpreter

The documented local OCU unit-test command SHALL run on the same CPython minor version as the orchestrator CI job, without relying on the interpreter uv would otherwise resolve. The pin SHALL NOT change test oracles, production code, the CI workflow or the deployed image interpreter, and SHALL NOT add interpreter-version skips or log filtering.

#### Scenario: Documented command from a clean checkout

- **WHEN** the documented `uv run --no-project` unit-test command runs from a clean OCU checkout root without an explicit interpreter override, whatever interpreter uv would otherwise resolve
- **THEN** the command runs on CPython 3.13, matching the orchestrator CI job
- **AND** the evidence shows the interpreter from the same invocation

#### Scenario: Cancelled discovery oracle is unchanged

- **WHEN** the MCP discovery cancellation tests run under the documented command
- **THEN** their no-unobserved-error assertion is unchanged and passes without skips or message filtering

### Requirement: Auth and WebSocket fixtures restore module ownership

The auth-guard app fixture and the WebSocket server-reload fixture SHALL evict and freshly import their owned app-module family only for the owning test, and SHALL restore every owned module key to its exact entry-time object, or to absence when absent at entry, after normal completion and after a test-body failure. They SHALL share the existing module-ownership helper rather than a second restore implementation. The WebSocket server reload SHALL require the scope value its ownership fixture yields, so that a caller cannot import the server outside the owned scope. The ownership regressions SHALL create a prefix-owned module inside the owned scope and SHALL report the child run's captured output when the child times out, crashes or produces no parsable JUnit file. Auth and WebSocket revocation assertions and production behavior SHALL remain unchanged.

#### Scenario: Owner completes normally

- **WHEN** a test uses either owner with its owned modules present at entry, or absent at entry, and completes
- **THEN** after the owner's real pytest teardown each owned key holds its exact entry-time object, and keys absent at entry are absent

#### Scenario: Test body fails

- **WHEN** a real pytest test body using either owner fails, with its owned modules present or absent at entry
- **THEN** that test's failure is reported
- **AND** a following test in the same process observes the owned keys restored to their exact entry-time objects, and keys absent at entry absent

#### Scenario: Direct reload caller

- **WHEN** a WebSocket test calls the server reload directly instead of through the app fixture
- **THEN** the reload accepts only the scope value yielded by the ownership fixture, runs inside that owned scope, and its modules are restored after the test
- **AND** a caller that omits the ownership fixture fails at the reload call with an error that names the ownership fixture, before any server import

#### Scenario: Prefix-owned module imported inside the scope

- **WHEN** an owner with a prefix-owned family runs with that family present or absent at entry, and a module under the prefix is imported inside the owned scope
- **THEN** after the owner's teardown the key holds its exact entry-time object when present at entry, and is absent when absent at entry

#### Scenario: Child run diagnostics

- **WHEN** the body-failure regression's child pytest run times out, exits without writing its JUnit file, or leaves a JUnit path whose content cannot be parsed
- **THEN** the regression fails with a message that contains the child's captured stdout and stderr

### Requirement: Environment-reload tests restore module ownership

The startup-warning tests and the OpenCode alias-map tests SHALL evict and freshly import their owned modules only within each test and SHALL restore every owned module key to its exact entry-time object, or to absence when absent at entry, after normal completion and after a test-body failure. They SHALL use the shared module-ownership helper. Existing warning and alias assertions and production behavior SHALL remain unchanged.

#### Scenario: Startup-warning test finishes

- **WHEN** a startup-warning test runs through its real test-case lifecycle, with `docker_manager` present or absent at entry, and its body either completes or fails
- **THEN** afterwards `docker_manager` and its submodule keys hold their exact entry-time objects, and keys absent at entry are absent

#### Scenario: Alias-map test finishes

- **WHEN** an alias-map test imports a fresh CLI runtime, with its owned modules present or absent at entry, and its body either completes or fails
- **THEN** afterwards the CLI runtime, Docker manager and outputs broker keys hold their exact entry-time objects, and keys absent at entry are absent
- **AND** the alias-map tests' automatic fixture still depends on that module ownership

### Requirement: Orchestrator module run instructions resolve the checkout namespace

Every per-module run instruction in an orchestrator test docstring SHALL be a command that, copied as written and run from a clean checkout root with no `PYTHONPATH`, resolves the `tests` namespace and collects the module. Its tests SHALL pass when the module's own documented prerequisites are met. Instructions SHALL NOT require a working directory from which the `tests` namespace cannot be imported. An orchestrator test module that keeps a `__main__` script entry and imports `tests.*` at module level SHALL make the checkout root importable before that import, so that running the file directly from the checkout root works. Historical changelog entries are excluded.

#### Scenario: Copying a documented module command

- **WHEN** a reader copies an orchestrator test module's documented run command and executes it from a clean checkout root
- **THEN** the module collects without a `tests` import error, and its tests pass when its documented prerequisites are met

#### Scenario: Running a module's script entry

- **WHEN** an orchestrator test module with a `__main__` entry and a module-level `tests.*` import is run directly from the checkout root
- **THEN** it imports and its tests pass

### Requirement: Auth-guard fixture owns the server's local import closure

The auth-guard app fixture SHALL own, by name or prefix, every module whose file lives under `computer-use-server/` that a fresh server import can load, eagerly or lazily, so that each fixture generation binds only modules of its own generation. A regression in the auth-guard test module SHALL assert that every module present inside the owner's scope whose file lives under `computer-use-server/`, excluding the standalone `drawio/` script directory that the server never imports, is owned, so the owned set cannot drift silently behind the server's import graph. Auth-guard assertions, the shared module-ownership helper and the other owners' sets SHALL remain unchanged.

#### Scenario: Closure is covered

- **WHEN** a test imports the server through the auth-guard owner, with any server-local modules cached from earlier tests in the same process, including the `drawio/` script loaded by its own test
- **THEN** every `sys.modules` entry whose file resolves under `computer-use-server/` outside `drawio/`, and every Python module file on disk under `computer-use-server/` outside `drawio/`, is matched by the owner's names or prefixes
- **AND** adding a server-local module file without owning it fails that regression with the module named, whether or not any test has imported it yet

#### Scenario: Second generation binds current modules

- **WHEN** the server is imported inside the auth-guard owner's scope twice in sequence
- **THEN** the second scope's `docker_manager` is a different object from the first scope's
- **AND** inside the second scope the Office lookup-admission module binds the current `docker_manager` module and the current `StateCorruptError` class, and the CLI runtime binds the current `docker_manager` capture function
