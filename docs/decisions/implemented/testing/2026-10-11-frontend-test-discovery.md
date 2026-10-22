---
id: 2026-10-11-frontend-test-discovery
title: Bound frontend suite discovery to source roots
kind: testing
status: implemented
date: 2026-10-11
supersedes: none
references: issue-219
---

# Bound frontend suite discovery to source roots

## Problem

Vitest does not use Git ignore rules to exclude copied test suites. Build snapshots can carry incomplete SvelteKit configuration and fail root test commands independently of the official suites.

## Decision

The Vitest branch of `vite.config.ts` owns discovery for Make, npm and coverage consumers. Only `src/`, `scripts/` and `e2e/` (`*.test.ts` only, added by [browser failure evidence](2026-10-22-browser-failure-evidence-redaction.md)) are test roots. Patterns retain Vitest's test/spec filename families and default exclusions; uncommitted tests within those roots remain discoverable.

User-owned snapshots are not test inputs and need no cleanup. Adding an official test root requires updating this shared policy and checking complete suite discovery.

## Alternatives considered

- Exclude only `.run/**`: other unrelated snapshot roots remain discoverable.
- Add command-specific flags: Make, npm and coverage can disagree about suite selection.
- Filter through the Git index: uncommitted developer tests would disappear from discovery.

## Consequences

The discovery boundary is explicit rather than repository-wide. Existing Svelte browser resolution and dependency inlining remain part of the shared test configuration. Filename and root changes require discovery evidence, not just a passing count of the remaining tests.
