---
id: 2026-09-23-ocu-outputs-http-validators
title: Validate reconciled page metadata rather than cached counters
kind: architecture
status: implemented
date: 2026-09-23
supersedes: none
references: 'Plan 1 D11/D15; issue16; 2026-09-23-ocu-broker-identity-observation'
---

# Validate reconciled page metadata rather than cached counters

## Problem

Sandbox writers are external to the broker lock. A cached revision cannot prove an unchanged listing, and the same revision can identify different pages or display metadata.

## Decision

Reconcile off-thread before evaluating conditional GET. A weak ETag hashes deterministic page metadata, including chat, files, total, revision, next cursor and effective limit; only request timestamp is excluded. Matching validators return an empty304 after authorization and cursor validation. Invalid cursor integers become typed cursor errors, never unhandled500s.

Keep the existing files envelope and modified seconds for the one release required by issue16. Emit percent-encoded prefixed file URLs, preserving directory separators. Describe reads the persisted broker counter without rescanning or creating an index, completing D11's deferred integration.

## Alternatives considered

- **Strong revision-only ETag** — incorrectly treats different pages, display metadata and timestamps as byte-identical.
- **Compare before reconcile** — misses external filesystem changes.
- **Second endpoint scanner** — splits identity authority and path-safety behavior.
- **Rebind the production data root for tests** — races requests and lock roots; test module isolation must follow the shared authority instead.

## Consequences

Metadata hashing is bounded to the selected page and does not hash unchanged output contents. Same-size content edits remain the broker's declared blind spot. Current SPA pagination consumption follows in issue17. OCU PR10 merged at6757ec6; parent suite638 passed/5 skipped, HTTP listing/304/change and oversized-cursor400 smoke passed. No Docker acceptance is claimed.
