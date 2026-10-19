# Proposal

## Why

Full-root receipt cleanup verification fails nominal exception classification because two file-route test fixtures replace `descriptor_io` while retaining `uploads` bound to its previous module object. Each fixture independently reproduces the failure before the unchanged receipt target; production classification is not implicated.

## What Changes

- Restore coherent receipt-module imports inside the two proven file-route fixture lifecycles and restore caller-owned cache entries afterward.
- Preserve the direct receipt test and all file-response/header assertions; add deterministic ownership regressions at the fixture seam.
- Retain identity traces, focused RED/GREEN and qualified full-root evidence, with unrelated failures and skips explicit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-pytest-discovery`: receipt exception identity survives file-route fixture execution and cleanup.

## Impact

OCU tests `test_file_response.py::workspace` and `test_files_headers.py::app_module`, their narrowly scoped test support/regressions, and `tests/README.md`. Control contract and evidence live here. No production, dependency, CI-selection or release changes.

## Risk classification

Expanded fixture: shared module identity spans two independent owners and validates descriptor/committed-write error semantics. Selected packs: config/setup; shared-state/ordering; file/path safety; error/rollback/partial outputs; compatibility; documentation. No new production API, schema, authorization, resource-limit or packaging behavior.
