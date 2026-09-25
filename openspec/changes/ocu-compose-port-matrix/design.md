# Deployment topology design

## Context

Issue24 implements task14.1. Existing overlays use `ports: !override` and full environment replacement; the latter must explicitly carry the topology/auth inputs needed to run this slice. User-approved in-place adoption avoids a second deployment implementation. See proposal for ownership authorization.

## Goals and non-goals

Governing invariant: the proxy is the only Compose service publishing host ports; sandboxes use a separately provisioned bridge, and control-plane services never join it.
Must preserve: base development Compose files, existing provider/data mounts, gateway access policy, sandbox non-destructive incompatibility failures, and the native proxy harness.
Non-goals: firewall policy (#25), retention changes and complete env/bootstrap migration (#26), runtime overlay acceptance (#27/#36), image digest/offline build (#33), backup/restore (#34). No local or CI Docker commands are executed for this issue; deliver commands but defer running them.

## Decisions

1. Adopt `deploy/production-like-test/compose.{core,webui}.override.yml` in place. Remove host publications using the existing override mechanism, not empty-list merge assumptions. Keep distinct base-stack invocations and a shared, explicitly named control-plane bridge; introduce a proxy overlay/stack without copying application services. Adopt only local files referenced by these overlays that a fresh checkout needs; inspect each dependency, retain its behavior, and list it in the PR rather than adding the directory wholesale.
2. Provision the sandbox bridge outside the Compose project lifecycle. Deployment preflight validates distinct control-plane/sandbox names and non-overlapping IPv4 subnets, gateways belonging to their subnets, and existing network driver/internal/IPAM compatibility. Create only a missing network; re-inspect after creation or a concurrent-create conflict. Other inspection/create errors abort. Never delete, replace, disconnect, or silently accept an incompatible network. No dummy service joins the sandbox bridge merely to make Compose create it.
3. Pass `OCU_SANDBOX_NETWORK`, `OCU_SANDBOX_SUBNET`, and the same gateway as `SANDBOX_HOST_BIND_IP` to OCU. Do not inherit the old control-plane gateway binding. Require necessary internal token, public origin/base URL and owner-auth URL explicitly; do not fabricate credentials or alter broad provider configuration. Retire the obsolete private port-binding patch and its usage claim; do not remove the separate CLI-autostart patch in this slice.
4. Add a proxy image and entrypoint around the existing renderer: nginx plus Python, explicit-copy only policy sources (never generated nginx.conf/runtime), one unprivileged UID able to create private runtime/config files, render before foreground nginx exec, explicit container DNS upstreams and non-loopback listen address. Both upstream stacks must exist before proxy config validation. Do not duplicate routes, header policy or token handling. Container image build/run evidence is deferred, while the same entrypoint is exercised natively.
5. `deploy/check-ports.sh` consumes resolved `docker compose config --format json` documents, not raw YAML or a second renderer. Across the complete stack set, require exactly one proxy service with the intended TCP listen/publication mapping; reject any publication by every other service, host networking or service/container network namespace sharing, missing/duplicate critical services, and malformed/incomplete input. Diagnostics identify the service/reason without printing env or rendered secrets. `expose` is not a host publication.
6. A single deployment entry resolves all stack configs into private temporary files, runs the checker before any service start, provisions/validates networks, then starts application stacks before proxy. Fail closed on command/check failures and remove temporary configs on success/error/signals. Do not run `down`, clean volumes, apply patches, or contact a deployment host. Later firewall work hooks into this entry before start; this slice alone is not a safe-LAN-isolation claim.

## Seams and evidence

- Actual checker CLI: synthetic resolved JSON for clean topology -> zero; WebUI/OCU/unrelated service publications including loopback -> nonzero; host/network-sharing bypass, missing proxy, malformed input -> nonzero. These prove validator behavior, not Compose rendering.
- Provisioning/deployment entry with a fake Docker executable backed by independent state: create missing, reuse compatible, refuse mismatches, propagate inspection failures, recheck concurrent creator, and no service starts when a check fails. No real Docker executable is invoked.
- Parse source overlays with existing YAML tooling for structural assertions only, handling `!override` without claiming to emulate Compose merge. Verify all referenced local build/mount files exist in the submitted tree.
- Native entrypoint smoke with real nginx and local upstream fixtures: private config, expected listen/upstreams, response forwarding and shutdown; missing token fails without serving or revealing token. Existing proxy-smoke source pin and access-policy tests remain authoritative for policy.
- Final acceptance #36 must execute actual Compose rendering/build/start, inspect the independent bridge and service membership, and prove the resolved and runtime publication matrix. Static/fake/native evidence does not replace that proof.

## Risks and migration

Sibling surfaces: both overlays' environment replacement; bootstrap gateway values; manual patch/run instructions; backup's fixed file inventory; renderer absolute paths and nginx parse-time DNS. Update topology usage instructions and decision record, and hand off bootstrap/backup adoption to their owning issues. Do not suggest using the old direct-port overlay as rollback.
Existing incompatible sandbox containers are preserved and launch is refused; operators migrate deliberately. Existing network disagreement is an error, not an automatic migration. This issue does not deploy or change existing runtime env files.
Review focus: publication bypasses, network persistence/races, fresh-checkout dependency closure, private render artifacts, and precise deferred-evidence claims. Adoption and packaging may exceed 400 lines; justify the actual atomic slice rather than weakening the limit silently.
