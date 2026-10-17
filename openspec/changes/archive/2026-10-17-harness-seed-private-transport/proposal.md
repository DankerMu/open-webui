# Proposal

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; shared CLI credentials, private file IO and interruption lifetime require expanded coverage.
Blast radius: generic seed and smoke commands, including seed callers in e2e and UI verification.
Selected risk packs: script entry, config/setup, secrets, file IO, resource lifetime, compatibility, error handling, documentation.
Evidence floor: argv/privacy RED/GREEN, permission and cleanup fault cases, actual curl/Hurl/API execution and report-redaction control.

## Why

#375 identifies password-bearing curl and Hurl arguments in the generic seed/smoke flow. Private file transport must cover both phases atomically; fixing only one leaves the other disclosure path.

## What Changes

- Keep the shared seed entrypoint and resolve credentials once; use private request-body files instead of curl data arguments.
- Give generic smoke a thin script that reuses seed's private lifetime and supplies Hurl secrets by file, not Make-expanded values.
- Verify permissions, default/override alignment, child failures/interruption cleanup and actual Hurl redaction; record the transport ownership decision.

## Capabilities

### New Capabilities

- `harness-seed-transport`: private credential transport and lifetime for generic seed/smoke. Existing `ocu-proxy-smoke` governs separate Office/resource credentials; `harness-environment` governs backend dotenv loading, not this flow.

## Impact

`Makefile`, `scripts/seed.sh`, new `scripts/smoke.sh`, the variable-transport note in `smoke/api.hurl`, a focused backend-discovered test module/target, and one testing decision record. No app auth, dependency, CI, Office proxy or AGENTS changes.
