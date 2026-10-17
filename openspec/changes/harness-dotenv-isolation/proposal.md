# Proposal

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; shared launcher/config and conditional secret-file loading require expanded coverage.
Blast radius: development and isolated UI backend startup environments.
Selected risk packs: script entry, config/setup, file IO, secrets, compatibility, documentation.
Evidence floor: safe real-import RED/GREEN, both launcher boundaries, existing runtime smoke and doc gates.

## Why

#419 identifies a gap between the harness no-dotenv-content policy and the shared environment script. When the parent flag is unset or false, a real application environment import can enter dotenv parsing; a safe in-memory counterexample confirms this without accessing a dotenv file.

## What Changes

- Enforce the disable flag in the shared harness environment before backend Python imports; remove the redundant UI-backend mapping entry.
- Add a focused behavioral regression and Makefile entry, preserving explicit harness values and ordinary application dotenv behavior.
- Document that content loading is blocked, not path discovery; keep application env.py and root AGENTS unchanged.

## Capabilities

### New Capabilities

- `harness-environment`: content-isolated backend startup environment shared by development and UI harnesses. Existing proxy/UI specs govern their test surfaces, not this shared environment boundary.

## Impact

`scripts/dev-env.sh`, the redundant entry in `scripts/verify-ui-ocu.py`, one discovered backend test module and its Makefile target. No production app, auth, dependency, OCU source, database schema or CI changes.
