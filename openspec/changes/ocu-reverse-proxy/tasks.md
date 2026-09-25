# Tasks

## 1. Gateway configuration

- [ ] 1.1 Approve expanded fixture and strict validation; record nginx/rendered-table choice and existing launcher/stub limits.
- [ ] 1.2 Implement tracked table, renderer, ignore rules and token-free sources only under new deploy/proxy; tests prove private atomic rendering, visible-ASCII token validation and punctuation preservation, fail-loud invalid inputs and no secret-valued errors.
- [ ] 1.3 Implement exact allowlist/auth/header/prefix routing, mutation-denial provenance, WS forwarding and generated-file policy; native nginx behavioral evidence covers auth401/404, mutation403, encoded paths, identity overwrite, upstream errors and MIME/download behavior.
- [ ] 1.4 Document render then existing-launcher operation, protected runtime configuration, environment inputs and deferred overlay provisioning; confirm user-owned deploy files remain untouched.

## 2. Acceptance and handoff

- [ ] 2.1 Run nginx -t and actual WebUI harness plus existing stub through proxy-dev; use a temporary non-echoing recording upstream for the broader security matrix, with exact commands/results and teardown evidence.
- [ ] 2.2 Expanded correctness/integration, security and test-evidence cross-review with bounded repairs; freeze the reviewed OCU candidate without merging, then require issue23 permanent make smoke-proxy and CI against that exact commit before sequential OCU/WebUI merges and fixture archive (user-authorized paired gate).
- [ ] 2.3 Hand off permanent smoke/CI, nested routes/WS and private token observations to issue23; explicitly record existing unsafe stub echo and do not claim token containment from that fixture. Docker/compose/firewall acceptance remains issues24–27/36.

## Risk mapping

Config/secrets:1.2. Auth/security and routing:1.3/2.1. Compatibility:1.3/1.4. Runtime evidence:2.1. No application-auth, database, CI or deployment topology edits in this slice.
