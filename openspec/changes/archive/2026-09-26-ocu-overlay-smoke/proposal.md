# Proposal

## Why

Issue27 adds the post-deployment verification command for umbrella14.4. Configuration and fake lifecycle checks do not establish live port exposure, packet traversal or the foreground process created by the actual terminal entrypoint.

## What Changes

- Add an operator-run overlay smoke command that checks the deployed Compose port matrix and refuses direct access through the former OCU publication.
- Require working positive controls before accepting sandbox-to-control-plane connection timeouts, and verify successful HTTP access to an explicitly allowlisted destination.
- Open the actual product terminal path in a dedicated operator-selected smoke sandbox, observe plain Bash rather than an auto-started CLI, and clean up only terminal state created by this run.
- Fail loudly for assertion failures and unsuitable prerequisites. Never report partial or deny-all-only evidence as a complete five-assertion success.

## Capabilities

### New Capabilities

- `ocu-overlay-smoke`: bounded post-deployment evidence for ports, network isolation, allowed egress and terminal defaults.

### Modified Capabilities

None. Existing topology, egress/DNS and terminal environment policy remain unchanged.

## Impact

OCU deploy smoke wrapper/module, necessary narrow fake CLI/native test helpers and deployment instructions. No application lifecycle rewrite, automatic deployment, container creation/deletion, firewall mutation or backup/rollback change. The terminal environment is already supplied by issue26.

## Fixture and evidence boundary

Expanded, high-risk verification artifact. Selected packs: CLI/config, security/network boundary, resource/process ownership, errors/cleanup, compatibility and documentation. Parent qualifies the command with fake CLI and native isolated process/protocol evidence. Every real Docker CLI/config/build/engine action remains deferred to final issue36 after all development; local fake success is not live deployment acceptance. Depends on completed20/22/25/26/79.
