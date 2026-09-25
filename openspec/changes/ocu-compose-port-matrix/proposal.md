# Proxy-only deployment topology

## Why

The deployment overlay publishes WebUI and OCU directly and binds sandbox ports to the control-plane gateway. The gateway and sandbox lifecycle require a dedicated provisioned bridge and a single public proxy entry.

Issue type: feature
Fixture level: expanded
Upstream suggested level: expanded (agree)
Blast radius: deployment exposure, sandbox connectivity, persistent bridge lifecycle.
Selected risk packs: CLI; config; file IO; secrets; concurrency; legacy compatibility; error handling; release packaging; migration notes.
Evidence floor: executable port-check and provisioning negative cases, native proxy packaging smoke, static overlay checks; all Docker execution deferred to final acceptance by user decision.

## What Changes

- **BREAKING**: remove WebUI/OCU host publications in the existing production-like overlays; add the proxy service as the sole publisher.
- Provision a dedicated non-internal sandbox bridge independently of Compose teardown, with matching OCU network/subnet/gateway inputs and no control-plane service membership.
- Add `deploy/check-ports.sh` and a deployment entry that checks resolved Compose JSON before starting services.
- Package the existing proxy renderer without copying its access policy or including generated secrets.
- Adopt the existing deployment files in place, restricted to this slice and their required local dependencies. User authorization: issue24 comment5827603085. Unrelated files and all credentials remain untouched.

## Capabilities

### New Capabilities

- `ocu-compose-port-matrix`: deployment network provisioning, proxy-only publications, and fail-closed preflight.

### Modified Capabilities

None. The proxy access policy and native sandbox membership contract remain unchanged.

## Impact

OCU deployment overlays, proxy image/entrypoint packaging, deployment preflight, and paired tests; decision record in the WebUI control repository. Firewall enforcement, retention behavior, broad environment generation, image digest delivery, backup/restore, and real Docker acceptance remain separate issues. The WebUI proxy-smoke source pin stays unchanged unless its consumed renderer behavior changes, which is not planned.
