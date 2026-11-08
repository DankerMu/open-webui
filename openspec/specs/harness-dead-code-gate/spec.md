# harness-dead-code-gate Specification

## Purpose

How the scoped anti-drift gate reports dead code: vulture findings block in fork-added files and on fork-added or fork-changed lines of modified upstream files, so pre-existing upstream dead code does not block a change.

## Requirements

### Requirement: Scoped vulture blocks only on fork lines of modified upstream files

`scripts/anti-drift.sh` SHALL block on every vulture finding in a fork-added Python file in the change scope, and on every finding attributed to a line that the fork added or changed in a modified upstream Python file, where an unused-import finding is attributed to the line of the imported name itself. It SHALL print every other finding as advisory without blocking. It SHALL block when vulture exits with any code other than 0 or 3, or exits 3 without output that it fully parses into findings, or reports an input error on stderr.

#### Scenario: Upstream dead code in a modified file is advisory

- **WHEN** the only vulture finding is an unused import on an upstream line of `backend/open_webui/utils/middleware.py`, which the fork modified on other lines
- **THEN** anti-drift passes and prints the finding as advisory

#### Scenario: Fork-added dead code in a modified file blocks

- **WHEN** a vulture finding points at a line the fork added to a modified upstream Python file
- **THEN** anti-drift fails and prints the finding

#### Scenario: vulture failure blocks

- **WHEN** vulture exits 2
- **THEN** anti-drift fails with `vulture failed (exit 2)`

#### Scenario: Fork-added name in an upstream multi-line import blocks

- **WHEN** the fork inserts a line `    sep,` into an upstream parenthesised import, and vulture reports `unused import 'sep'` at the statement's first, upstream, line
- **THEN** anti-drift fails and prints the finding

#### Scenario: Finding in a fork-added file blocks

- **WHEN** a vulture finding points at any line of a fork-added Python file
- **THEN** anti-drift fails and prints the finding

#### Scenario: Unparsable vulture output blocks

- **WHEN** vulture exits 3 and prints a line that is not a finding
- **THEN** anti-drift fails with `vulture output unreadable`
