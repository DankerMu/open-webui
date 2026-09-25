# Proposal

## Why

The reviewed native gateway needs a durable real-WebUI regression gate before the paired configuration PR can merge. The existing stub publicly reflects its Authorization header and cannot support credential-containment assertions.

## What Changes

- Add make smoke-proxy and smoke/proxy/\*.hurl outside the ordinary smoke glob, with finite owned-service lifecycle and private observations.
- Extend the existing OCU stub for gateway fixtures and restrict credential echo to internal-only routes; preserve make smoke-stub.
- Pin OCU source 818e9ca3ae1880ae1e95b0ad7f84d61bbefb79e4 in constraints.yaml; CI layer3 checks out the public repository under .run/open-computer-use and runs the same native command.
- Update AGENTS.md Verification Matrix and constraints verification surface; flag CI modification in the PR.

## Capabilities

### New Capabilities

- `ocu-proxy-smoke`: exact-source permanent gateway assurance and secret-safe fixture observations.

### Modified Capabilities

None; runtime gateway contract remains the approved ocu-reverse-proxy change.

## Impact

WebUI scripts/ocu-stub.py, its existing smoke, new smoke-proxy orchestration/assertion helpers, smoke/proxy, Makefile, constraints.yaml, CI layer3 and one AGENTS.md matrix row. No WebUI production auth code, UI, schema, OCU source or user-owned deployment files.

## Fixture triage

Expanded; verification-construction critical profile. Risks: auth/status provenance and header ownership; observable no-contact/credential containment; subprocess/data cleanup and private evidence; exact cross-repo pin/CI parity. Every required matrix row must distinguish a plausible broken gateway. Existing temporary #22 proof is reference evidence, not a substitute for permanent #23 acceptance.

Paired gate authorized in issue22 comment5817655278 and issue23 comment5817655738: OCU PR15 stays unmerged until this change's permanent smoke and CI pass against its reviewed source; merge OCU then WebUI, one implementer at a time. Docker remains deferred to issue36.
