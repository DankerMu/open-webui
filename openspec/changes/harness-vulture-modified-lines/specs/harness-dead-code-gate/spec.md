## ADDED Requirements

### Requirement: Scoped vulture blocks only on fork lines of modified upstream files

`scripts/anti-drift.sh` SHALL block on every vulture finding in a fork-added Python file in the change scope, and on every finding on a line that the fork added or changed in a modified upstream Python file. It SHALL print every other finding as advisory without blocking. It SHALL block when vulture exits with any code other than 0 or 3, or exits 3 without output that it fully parses into findings.

#### Scenario: Upstream dead code in a modified file is advisory

- **WHEN** the only vulture finding is an unused import on an upstream line of `backend/open_webui/utils/middleware.py`, which the fork modified on other lines
- **THEN** anti-drift passes and prints the finding as advisory

#### Scenario: Fork-added dead code in a modified file blocks

- **WHEN** a vulture finding points at a line the fork added to a modified upstream Python file
- **THEN** anti-drift fails and prints the finding

#### Scenario: vulture failure blocks

- **WHEN** vulture exits 2
- **THEN** anti-drift fails with `vulture failed (exit 2)`
