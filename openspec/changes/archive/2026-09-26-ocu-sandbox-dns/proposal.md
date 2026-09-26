# Proposal

## Why

Mandatory issue79 closes the DNS boundary required by the user's all-sandbox-egress allowlist decision. Docker-inherited nameservers can forward from the host namespace, outside the sandbox-ingress firewall; merely observing `127.0.0.11` in resolv.conf does not establish upstream routing.

## What Changes

- Require explicit production `OCU_SANDBOX_DNS`: ordered IPv4 resolvers, with an explicitly empty policy represented by a nonempty container-local override that disables external forwarding.
- Validate resolver destinations against the existing allowlist and hard denies before deployment; require resolved OCU configuration to carry the same policy.
- Apply DNS at create/recreate and refuse incompatible existing-container DNS before start, unpause, running reuse or deployment readiness. Never automatically delete, recreate, stop or disconnect a refused container.
- Preserve optional non-policy development behavior, disabled-network behavior, embedded service-name resolution, CDP/ttyd reply paths and existing lifecycle aliases.

## Capabilities

### New Capabilities

- `ocu-sandbox-dns`: explicit upstream configuration, immutable DNS compatibility and deployment readiness.

### Modified Capabilities

None. Network membership, egress rule algorithm and lifecycle ownership remain governed by their existing canonical specs; this capability adds a DNS compatibility condition at those boundaries.

## Impact

OCU lifecycle manager and startup validation, one shared stdlib-only DNS policy module packaged in the server image, deployment preflight/bootstrap/core environment and existing stateful fake-engine/CLI tests. No new DNS service, domain allowlist, DoH filtering, TLS inspection, general lifecycle redesign or automatic migration.

## Fixture and evidence boundary

Expanded, high-risk. Selected packs: CLI, config/project setup, auth/permissions/security, concurrency/shared state, error handling/rollback, legacy compatibility, release/packaging, documentation/migration. Moby primary sources establish the intended override mechanism; native/fake tests prove configuration, refusal and preservation. All Docker CLI/config/build/engine and privileged firewall actions remain deferred to issue36 after development. This development slice must not claim real packet-routing acceptance.

## Sources and dependencies

Depends on completed issues20/25; uses issue26's current private bootstrap. Mandatory predecessor of issues27/36. Reference `ocu-network-isolation`, `ocu-lifecycle`, `ocu-sandbox-egress-guard`, `ocu-compose-port-matrix`, `ocu-retention-env` and the umbrella group21. Moby resolver source inspected at blob `a1163b9bf5e90644a0a377aecb66557c2df2d5f7`; resolvconf at `6c8b2523c498cd88892ecfe003dd64fc76c3bfe8`.
