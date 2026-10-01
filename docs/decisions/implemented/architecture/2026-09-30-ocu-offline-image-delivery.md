---
id: 2026-09-30-ocu-offline-image-delivery
title: Offline image archives with mandatory content verification
kind: architecture
status: implemented
date: 2026-09-30
supersedes: none
references: issue-33, issue-34, issue-36, 2026-09-26-ocu-private-runtime-provisioning, 2026-09-29-ocu-pyodide-offline-materials, 2026-09-30-ocu-local-drawio-materials, 2026-09-30-ocu-cold-backup-recovery
---

# Offline image archives with mandatory content verification

## Problem

Startup rebuilds locally named images, while image export/import does not guarantee preservation of registry manifest references. Bare configuration digests also violate the workspace's image-name-dependent entrypoint contract. Offline delivery needs a stable content identity without adding registry operations.

## Decision

Deliver named image archives with mandatory configuration-digest and archive SHA-256 verification. These digests have distinct meanings and are not registry manifest digests. Content-derived names preserve the workspace naming contract. Verify all six roles on import and before deployment mutation; forbid build and pull at startup.

One machine release inventory binds both repository commits, target platform, image/archive identities, non-secret build arguments and material input provenance. The existing deployment-version report renders that inventory alongside runtime policy. Required tracked OCU source and initializer bind assets travel with the release; credentials and untracked worktree files do not.

Online build-time materialization remains permitted. Local Pyodide and Draw.io closures remain enabled, as do configured LAN model/RAG endpoints. User-authored remote content and explicitly selected external integrations are not silently disabled or misrepresented as bundled material.

## Alternatives considered

- **Internal registry with manifest-digest references** — adds an operational service and availability dependency the selected archive workflow does not need.
- **Tags without content verification** — mutable names do not establish release identity.
- **Bare image IDs or fabricated name@config-digest references** — violate application naming behavior or confuse configuration and registry manifest identities.
- **Build during startup** — defeats offline operation and changes reviewed image contents.

## Consequences

Operators must import and explicitly migrate to a verified release before startup; existing protected runtime files are not overwritten. Failed import may leave image-cache entries but never deletes unrelated images or publishes a partial installation. Handled cancellation records allocated temporary paths before signal delivery and removes only owned staging data and reservations. This does not establish SIGKILL or power-loss recovery. Trusted host administrators can still mutate daemon state; this is integrity checking, not protection against a hostile host.

Source verification cannot attest engine export/import, platform compatibility or WAN-free operation. Those remain mandatory final acceptance after source development, including preserved database settings that can override environment defaults. Backup and one-version rollback use the same release inventory rather than introducing another image authority.
