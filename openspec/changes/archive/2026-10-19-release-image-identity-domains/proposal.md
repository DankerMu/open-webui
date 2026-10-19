# Separate release image identity domains

## Why

The real Docker Desktop containerd-store producer records an engine manifest ID as `configuration_digest`; the exported archive independently contains a different configuration digest. Correcting only that field makes loaded/local/container checks reject the valid image. Owner approval selects actual configuration identity with separately verified descriptor identities, not a narrower engine-only workaround.

## What Changes

- Derive configuration identity and content-derived names from saved bytes; retain only archive-verified descriptor identities as alternate engine identities.
- Verify the complete archive set before publication, and preserve verification-before-load at import.
- Apply the same identity contract to existing-tag checks, loaded/local images, startup, provenance and recovery containers.
- Preserve valid classic-store deliveries and rollback while requiring new producers to bundle readers capable of consuming descriptor identities.
- Document qualified local Engine/Desktop export/store paths and explicit remote-daemon/Podman exclusions.

## Capabilities

Modified: `ocu-offline-image-delivery` — configuration, descriptor and engine identity separation across production and consumption.

## Impact and triage

Issue type: bugfix / release
Fixture level: expanded
Upstream suggested level: absent; expanded required by persisted schema, archive parsing, publication and recovery.
Blast radius: unimportable published releases, wrong-image acceptance or false startup/recovery refusal.
Selected risk packs: CLI; configuration; file IO; schema; concurrency; resource bounds; legacy compatibility; errors/rollback; release; documentation.
Evidence floor: semantic real-producer red; deterministic boundary regressions; actual seven-role CLI build/export/verify/import/load with owned committed inputs on qualified descriptor-ID and classic config-ID engines; loaded/local/container checks; independent three-seat review.

The fixture lives in WebUI; implementation remains in the sibling OCU checkout. No production deployment or LAN acceptance is authorized. Real-engine release-path fixtures are identified as fixtures, not certified application images or WAN-free product acceptance.
