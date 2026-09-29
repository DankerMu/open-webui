---
id: 2026-09-29-ocu-pyodide-offline-materials
title: Pinned local Pyodide material closure
kind: architecture
status: implemented
date: 2026-09-29
supersedes: none
references: issue96, issue33, openspec/specs/ocu-pyodide-materials/spec.md
---

# Pinned local Pyodide material closure

## Problem

Offline browser imports require the supported package closure, not merely the Pyodide runtime. A distribution lock does not describe supplementary PyPI wheels, and successful downloads alone do not prove that cached bytes or published metadata are complete.

## Decision

Preparation resolves the installed, lockfile-pinned Pyodide distribution with the explicit supplementary manifest in `scripts/pyodide-supplement.json`. The manifest records fixed wheel URLs, versions, SHA256, import names and dependencies; normal preparation never resolves latest versions. New supplementary assets are seaborn0.13.2, openpyxl3.1.5 and et_xmlfile2.0.0, sourced from versioned PyPI release metadata. Existing supplementary versions remain unchanged.

Cached and downloaded wheels require matching hashes before a local lock is published. The runtime is copied before lock generation. An exclusive destination lock serializes publication and rollback across processes; competing publishers fail before mutation. Publication uses owned staging and recovery directories: a failed final rename restores the prior bundle; if restoration itself is refused, the recovery copy is retained and the command reports its location. A later attempt cannot delete that recovery copy. The final rename commits publication; backup cleanup failure cannot roll back a complete new bundle using a partially removed backup.

Runtime workers retain the standard `/pyodide/` index contract. The native browser verifier denies nonlocal requests and exercises all supported imports, numerical operations, exact plotted line data with rendered PNG output and spreadsheet round-trips. Its deadline closes the owned browser and HTTP server.

## Alternatives considered

- **Keep micropip.freeze against live indexes** — reintroduces unversioned latest and WAN during ordinary builds.
- **Hand-edit `static/pyodide/pyodide-lock.json`** — drifts from the installed distribution and is prohibited.
- **Upgrade existing black/pathspec/mypy_extensions/pytokens wheels** — rejected; those versions remain pinned.

## Consequences

Clean-directory preparation needs network access for uncached fixed materials; offline source rebuilding is not promised. The generated local closure supports offline deployment/runtime imports, not arbitrary third-party packages. Recovery directories and a publication lock left by an interrupted process require operator inspection; stale locks are not silently taken over. Deployment image provenance remains owned by issue33 and `2026-09-26-ocu-private-runtime-provisioning`.
