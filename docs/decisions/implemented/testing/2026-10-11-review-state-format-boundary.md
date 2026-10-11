---
id: 2026-10-11-review-state-format-boundary
title: Exclude generated review state from source formatting
kind: testing
status: implemented
date: 2026-10-11
supersedes: none
references: issue-221
---

# Exclude generated review state from source formatting

## Problem

Machine-local review state has generator-owned serialization. Including it in the repository JSON formatting glob makes source checks depend on transient workflow state.

## Decision

`.prettierignore` excludes only the root `/.review-gate.json`. Both Make formatting commands retain their repository-wide glob and formatter settings. Nested files sharing that basename and other tracked JSON remain within the existing formatting policy.

## Alternatives considered

- Reformat generated state: couples the local workflow generator to repository style and leaves ownership unclear.
- Ignore JSON or agent-state directories broadly: can hide unrelated source-format errors.
- Narrow the Makefile glob: changes source coverage rather than excluding the generated artifact.

## Consequences

Source-format checks do not rewrite or depend on root review state. Verification uses a nonformatted generated-state positive case and a tracked-JSON negative control; a passing formatter alone does not establish that tracked files remain checked.
