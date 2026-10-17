## ADDED Requirements

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
