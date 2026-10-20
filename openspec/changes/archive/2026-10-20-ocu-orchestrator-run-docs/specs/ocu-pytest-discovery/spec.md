## ADDED Requirements

### Requirement: Orchestrator module run instructions resolve the checkout namespace

Every per-module run instruction in an orchestrator test docstring SHALL be a command that, copied as written and run from a clean checkout root with no `PYTHONPATH`, resolves the `tests` namespace and collects the module. Its tests SHALL pass when the module's own documented prerequisites are met. Instructions SHALL NOT require a working directory from which the `tests` namespace cannot be imported. An orchestrator test module that keeps a `__main__` script entry and imports `tests.*` at module level SHALL make the checkout root importable before that import, so that running the file directly from the checkout root works. Historical changelog entries are excluded.

#### Scenario: Copying a documented module command

- **WHEN** a reader copies an orchestrator test module's documented run command and executes it from a clean checkout root
- **THEN** the module collects without a `tests` import error, and its tests pass when its documented prerequisites are met

#### Scenario: Running a module's script entry

- **WHEN** an orchestrator test module with a `__main__` entry and a module-level `tests.*` import is run directly from the checkout root
- **THEN** it imports and its tests pass
