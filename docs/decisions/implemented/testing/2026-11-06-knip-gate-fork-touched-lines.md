---
id: 2026-11-06-knip-gate-fork-touched-lines
title: Scoped knip gate blocks only fork-touched lines in modified upstream files
kind: testing
status: implemented
date: 2026-11-06
supersedes: none
references: issue-735
---

# Scoped knip gate blocks only fork-touched lines in modified upstream files

## Problem

The scoped knip step of `make anti-drift` never failed (#735), so fixing its data path made it enforce for the first time. The change scope is per file, so a one-line fork edit to an upstream file brings in all of that file's dead exports. At main 3e8d09e, one `Settings` field added by #732 brought in nine unused exports that upstream already had in `src/lib/stores/index.ts`. The fork did not write them, and clearing them means editing upstream declarations.

## Decision

`scripts/anti-drift.sh` classifies each in-scope knip finding by the file's `scripts/change-scope.sh --status`:

- In a file the fork added (`A`), every finding blocks.
- In an upstream file the fork modified (`M`), a finding blocks when its `line` is a `+` line of `git diff -U0 <baseline> -- <file>`, working tree included. The baseline is the commit `change-scope.sh --base` resolves. A finding with no line number also blocks, because nothing shows that it predates the fork.
- Every other finding in an `M` file prints as `<file>  advisory (upstream): unused <kind>: <name>` and does not fail the gate.

The rule lives in the knip report filter, the one place that reads the report. It is the knip row of AGENTS.md "Legacy violation baseline". `make test-guardrails` case 12 adds an export line to a modified upstream file and requires the gate to reject it.

## Alternatives considered

- **Edit the upstream declarations** (drop `export`, delete the ones nothing uses) — breaks the minimal-diff, rebase-able upstream rule (AGENTS.md Module Boundaries). Every future fork edit to an upstream file would force the same unrelated cleanup.
- **Treat every finding in an `M` file as advisory** — lets the fork add a dead export to any upstream file it already touches, which is where most fork changes to the spine land. That would leave the gate partly phantom again.
- **`ignoreExportsUsedInFile` in `knip.json`** — relaxes the rule for the whole repo, including fork-added files, and still reports upstream exports that nothing uses.

## Consequences

- The advisory output keeps upstream dead exports visible without failing the gate. That printed list is the baseline (AGENTS.md); it is not a fixed count and can grow when the fork first touches another upstream file, so reviewers read the advisory lines of a PR that adds an `M` file. At 3e8d09e it is the 9 upstream findings in `src/lib/stores/index.ts`.
- A fork edit to a line that already holds an upstream dead export makes that export blocking, so the editor must also handle it.
- Line attribution uses the diff against the baseline, so moving an upstream export inside a modified file counts as fork-touched.
- Files in scope only through uncommitted local edits follow the same rule.
