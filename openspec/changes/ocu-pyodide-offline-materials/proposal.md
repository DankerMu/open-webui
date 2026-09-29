# Pinned Pyodide runtime materials

## Intent
Supply the existing supported browser Python package set entirely from local assets for offline deployment. The user selected deploy/run/rollback offline delivery, not air-gapped source rebuilding, and authorized this prerequisite to issue33 while preserving features.

## Scope
Repair scripts/prepare-pyodide.js in place; retain its npm entrypoint and runtime worker APIs. Use the installed lockfile-pinned Pyodide distribution plus a small explicit supplementary wheel manifest. Preserve the existing four supplementary wheel versions; add fixed seaborn/openpyxl and required pure-Python dependencies with verified upstream hashes. Generated static/pyodide/pyodide-lock.json remains generated, never hand-edited. Add paired script tests and a native browser verifier through Makefile.

## Risk classification
Expanded fixture; VDD Construction/Critical for dependency integrity and verifier reliability. Selected: dependency/material integrity, filesystem publication, compatibility, offline-runtime evidence. Not selected: authorization/schema/sandbox lifecycle (unchanged); container/host networking (deferred and prohibited here).

## Governing invariant
A successful preparation exposes a lock whose supported package dependency closure is available locally with verified content hashes. Failure cannot advertise missing or corrupt material as success or destroy a previously valid bundle. Existing runtime consumers install the same supported names from the local index without WAN.

## Non-goals
Arbitrary user-selected packages outside the declared bundle, dependency upgrades, OCU changes, image-building, offline source rebuilding, Docker commands, or changing runtime iframe/security policy.

## Evidence
Semantic pre-change browser import failure with nonlocal requests rejected; focused missing/corrupt/dependency/publication tests; clean-directory real preparation; real browser imports and representative numerical, plotting and spreadsheet operations with a zero nonlocal-request oracle; fixed-point output; corruption/missing-material oracle qualification; scoped gates and three-seat review.
