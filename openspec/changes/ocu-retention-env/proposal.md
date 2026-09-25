# Proposal

## Why

Issue26 completes umbrella14.3. The retention service already stops without deleting, but bootstrap emits an obsolete source/image/network configuration that cannot satisfy the current deployment entrypoint. Its restart comment and historical terminal patch contradict explicit launch and the supported no-autostart environment contract.

## What Changes

- Preserve stop-only retention; remove the incorrect implicit-MCP-restart claim and prove retained container/volume/directory state at the CLI boundary.
- **BREAKING**: bootstrap requires explicit deployment source SHA, fork image references, public origin and egress policy instead of silently selecting the historical checkout, upstream WebUI image and direct OCU address.
- Provision all required topology/auth variables, one shared internal token, `/ocu` prefix and no-autostart policy; keep secrets private and refuse overwrites.
- Remove the obsolete patch and its version-record reference. Keep image build/digest/offline work in issue33 and DNS routing in mandatory issue79.

## Capabilities

### New Capabilities

- `ocu-retention-env`: safe runtime provisioning and stop-only retention deployment contract.

### Modified Capabilities

None. Existing lifecycle, network membership, proxy-only topology and egress-policy requirements remain unchanged.

## Impact

OCU `deploy/production-like-test/{retention/stop-overage.sh,compose.core.override.yml,scripts/bootstrap-test.sh,scripts/write-deployed-version.sh,patches/disable-cli-autostart.patch}`, necessary deployment tests and network-hardening instructions. User authorized scoped in-place adoption of existing deployment files; never stage unrelated files. No application lifecycle or proxy rewrite.

## Fixture and risk

Expanded. Selected: CLI; config/project setup; file IO/path safety; auth/permissions/security; legacy compatibility/examples; error handling/rollback; documentation/migration. Secret generation and privileged deployment configuration require independent acceptance. Concurrency is limited to refusing existing outputs, not a new concurrent bootstrap service. Release/build and real-engine acceptance are explicitly deferred, not claimed.

## Evidence boundary

Parent runs actual scripts only with isolated fake Docker/id/date/stat tools and synthetic credentials under temporary roots; no real Docker command, host firewall action, credential store access or deployment. Real 168h-container stop/data preservation and service startup with provisioned env remain in issue36 after all development. DNS issue79 remains mandatory before full egress readiness.
