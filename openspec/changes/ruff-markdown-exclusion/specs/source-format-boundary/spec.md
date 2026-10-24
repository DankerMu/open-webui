## ADDED Requirements

### Requirement: Markdown is outside the Python formatter boundary

The repository's ruff configuration SHALL exclude Markdown files from formatting and linting, so that Python code fences in documentation never fail a formatter check, whichever ruff version runs it, while Python source files stay checked.

#### Scenario: Newer ruff on a repository with Python fences in Markdown

- **WHEN** ruff 0.17.2 runs `ruff format --check . --exclude .venv --exclude venv` on a tree whose archived design docs contain double-quoted Python fences
- **THEN** it exits 0, the docs are unchanged, and it checks the same Python files as the locked ruff version
