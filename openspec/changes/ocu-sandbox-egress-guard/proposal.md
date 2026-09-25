# Explicit sandbox egress policy

## Why

Sandbox network membership and proxy-only publications do not prevent sandbox-initiated connections to other addresses. The user selected explicit destination allowlists for all sandbox egress, including public, company and host destinations; an unlisted address must be denied.

Issue type: feature
Fixture level: expanded
Upstream suggested level: expanded (agree)
Blast radius: host firewall, sandbox connectivity, control-initiated CDP/ttyd reply path.
Selected risk packs: CLI; config; auth/security boundary; shared-state ordering; error handling; file IO; packaging; migration documentation.
Evidence floor: independent fake firewall state and packet-policy judgments, real subprocess/lock/failure tests, source-fault qualification; actual Docker/kernel evidence deferred to #36.

## What Changes

- **BREAKING**: deployment requires `OCU_SANDBOX_EGRESS_ALLOW`, a comma-separated IPv4 address/CIDR allowlist. Unset is an error; explicitly empty means deny all new sandbox-initiated IP traffic.
- Add idempotent installer and read-only ordered-policy checker under `deploy/firewall/`, integrated after network provisioning and before application starts.
- Protect forwarded IPv4 traffic through DOCKER-USER and host-local traffic through INPUT. Hard control-plane and metadata denies precede destination allows; control-initiated reply traffic remains possible. Unsupported IPv6 egress is denied, not silently left outside the policy.
- Bind policy to the sandbox bridge ingress interface, not only its source subnet, so forged source addresses do not bypass it. Preserve unrelated host firewall rules.
- Record the mandatory DNS closure in #79: inherited Docker DNS can originate in the host namespace and bypass bridge-origin policy. #27 and #36 depend on both slices; this PR cannot claim full egress closure before #79.

## Capabilities

### New Capabilities

- `ocu-sandbox-egress-guard`: explicit destination policy, ordered host enforcement, idempotent reconciliation and deployment readiness checks.

### Modified Capabilities

None of the canonical specs changes its implementation contract. Align the umbrella integration change and network invariant documentation with the user's default-deny policy.

## Impact

OCU firewall scripts and their focused tests, `deploy/up.sh`, network-hardening instructions, and the WebUI control fixture/decision record. DNS/container lifecycle changes belong to mandatory #79, environment generation to #26, runtime smoke to #27, and real-engine/kernel acceptance to #36. No privileged firewall or Docker commands run during development; no new DNS proxy, domain policy, TLS inspection or deployment-host access.
