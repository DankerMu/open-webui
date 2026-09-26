# Design

## Context

Moby applies nameserver overrides only for a nonempty configured list (`sandbox_dns_unix.go:251-253`). Inherited servers carry HostLoopback and dial from the host; explicit overrides dial through the sandbox namespace (`resolver.go:483-500`). Its internal resolver filters its own address from external servers (`resolver.go:257-268`), and preserves resolver order while forwarding (`resolver.go:516`). These are source-grounded design facts, not real-engine acceptance.

`docker_manager.py` creates both normal and recreated sandboxes; `_prepare_existing_container` can repair stopped membership, while `_get_or_create_container` directly reuses running containers. Deployment already owns the allowlist/control subnet and supervised preflight ordering. The server image has an explicit module COPY list and build context limited to `computer-use-server`.

## Goals / Non-Goals

Close configured upstream inheritance and immutable DNS drift without destructive migration. No packet firewall rewrite, DNS proxy, resolver discovery, domain policy, container lifecycle redesign, continuous host enforcement or new build context.

## Decisions

- One stdlib-only `computer-use-server/sandbox_dns.py` owns syntax, effective Docker DNS values and compatibility. No SDK or environment access in this pure module. Package it with one explicit server Dockerfile COPY. Deploy imports this module from the source checkout; do not copy its logic into deploy.
- `OCU_SANDBOX_DNS` absent means unchanged non-policy development mode at runtime. Production bootstrap/up/resolved core configuration require presence, preserving explicit empty. Nonempty input is a comma-separated ordered list of one to three canonical IPv4 addresses; reject duplicates, malformed/interior-empty entries and unsupported families rather than silently truncating. Empty becomes `dns=["127.0.0.11"]`, never `[]` or omission. The sentinel has one definition in the shared module.
- Runtime validates configured syntax without Docker during startup and enforces the effective ordered list inside lifecycle transactions. Deploy alone owns resolver membership in the allowlist and exclusions: reuse `firewall.policy.parse_allowlist` and its metadata constant plus configured control subnet, passing parsed networks to shared validation where needed. Do not add the entire firewall configuration to the server environment or extract/reimplement the firewall rule inventory.
- Compatible means canonical ordered `HostConfig.Dns` equality. Missing/null/empty/wrong-type inspected DNS is incompatible under policy mode; reordering is not equivalent because Moby consumes order. An actual disabled-network container needs no DNS override or DNS compatibility check; do not pass custom DNS with network-disabled create. Invalid configured syntax still fails configuration.
- Check existing DNS before any start/unpause/membership repair, including running reuse in `_get_or_create_container`, create-conflict adoption, hostname retry and all launch/restart aliases. Refusal uses existing typed lifecycle errors (409 for incompatible existing state), preserves container identity, metadata and directories, and does not implicitly launch a stopped container. New create/recreate uses current server policy, not persisted/client DNS. Verify created authoritative DNS before start; an engine mismatch refuses without deleting the new container.
- Add one read-only supervised `deploy/check-sandbox-dns.sh` after network provisioning and before firewall installation/service starts. It validates policy and resolved core service DNS environment against the host input; deleting the overlay DNS field must fail rather than activate runtime development mode. Core interpolation uses required-but-empty `${OCU_SANDBOX_DNS?...}`, not `:?`.
- Preflight inspects the authoritative protected bridge and enumerates all containers with unfiltered `docker ps -a -q`, inspecting each object. Protected membership is identified from HostConfig network mode (bridge name or ID) or NetworkSettings membership (name or ID); this includes stopped and foreign/unlabelled containers. Unknown inspect/membership data fails with identity named; incompatible protected containers are reported and left unchanged. No reliance on a running-only/label filter or network-inspect's active-endpoint inventory.

## Verification and defeaters

Extend the authoritative existing fake engine to apply `dns` into inspected HostConfig, retaining independent lifecycle counters and persisted-state checks. Exercise new create, running reuse, stopped/paused launch, metadata recreate, conflict winner, disabled networking and non-policy development. Refused DNS must precede membership mutation. Deployment fake CLI exercises missing/empty/malformed policy, protected/non-allowlisted resolver, omitted/mismatched resolved environment, running/stopped/unlabelled incompatible containers, foreign-network exclusion and inspect failure with no starts or destructive calls.

Qualify major judges with isolated source faults: omitted DNS at create, inherited empty list for empty policy, skipped running/stopped compatibility, order-insensitive equality, skipped existing-container preflight, missing overlay forwarding and skipped allowlist/hard-deny checks. Baseline green, intended semantic red, restoration green. Invalid setup/import failures are not semantic evidence. Test effective consumer behavior rather than field-copy mocks or source-string pins.

## Alternatives and residual risks

`127.0.0.1` depends on whether a sandbox process can bind port53; the self-resolver sentinel is filtered by the inspected Moby implementation. No fallback is introduced if the final pinned engine rejects it: issue36 must verify acceptance, no external forwarding, internal service-name resolution and legitimate CDP/ttyd behavior. Daemon/SDK configuration mapping remains a required source/real-engine check, not inferred from resolv.conf alone.

Deployment is a point-in-time check; an administrator changing Docker topology/firewall afterward invalidates readiness. It does not police an actor with daemon control. Runtime checks cover OCU lifecycle reuse after preflight. Existing incompatible containers require operator migration that preserves required data; this slice does not perform that migration. No claim of real DNS packet isolation until issue36 completes.
