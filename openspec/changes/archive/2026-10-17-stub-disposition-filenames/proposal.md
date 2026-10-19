# Proposal

## Why

Issue358 identifies raw quote and backslash interpolation in the stub's Content-Disposition filename parameter. Accepted uploads remain stored, but the header can be malformed or decode to a different leaf name. This is local test-double fidelity, not a production vulnerability claim.

## What Changes

- Use one shared quoted-string serialization path for both inline and attachment filename parameters, preserving literal quote and backslash characters.
- Keep upload acceptance, stored names, retrieval bytes, disposition mode, control-character rejection and ordinary filename representation unchanged.
- Verify real fresh-chat upload-to-GET behavior with a standards-aware parser and raw header framing, then retain existing smoke controls.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-stub`: accepted quote/backslash leaf names round-trip through both Content-Disposition modes.

## Impact

`scripts/ocu-stub.py::_file_headers`, focused real-HTTP regressions and existing stub guidance. No production OCU/WebUI route, dependencies, upload/listing policy or unrelated fixture-owner changes.

## Fixture Contract

Level: expanded because HTTP header serialization crosses an input/consumer boundary and must preserve existing rejection and metadata behavior. Selected packs: public HTTP API, schema/serialization, input safety, downstream compatibility, test evidence and documentation. File persistence, concurrency redesign, config/dependencies, auth policy, deployment and performance changes are not selected; their existing behavior remains unchanged.
