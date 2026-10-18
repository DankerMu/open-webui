## ADDED Requirements

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
