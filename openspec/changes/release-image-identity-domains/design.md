# Design

## Change surface and governing invariant

`deploy/release.py` owns parsing, inventory, producer, import, local verification and provenance; `deploy/recovery_resources.py` owns container checks. Existing deployment scripts and docs consume these identities. Configuration identity always hashes the selected image's configuration bytes; an engine ID is accepted only when it is that configuration digest or a descriptor digest independently bound by the verified archive to the same reference, platform and configuration.

## Existing mechanisms and decisions

Reuse bounded Docker/OCI/hybrid parsing, checked source snapshots, daemon image-store locking, staged publication and explicit conflict refusal. The existing qualified DocumentServer record already distinguishes configuration and platform-manifest digests. Extend the existing parser and consumers in place; no second archive parser, raw-engine-ID authority or sidecar.

Expose a normalized, bounded `descriptor_digests` collection per archive reference and optionally per inventory image. It contains only hash-verified image-manifest and ancestor-index descriptors leading to that reference's linux/amd64 configuration. Never accept unrelated-platform, attestation, sibling-image or merely claimed digests. Duplicate/malformed entries and configuration masquerading as a descriptor fail schema/content validation. Docker-only archives contribute no descriptors; a classic image store can emit a hybrid archive, whose verified OCI metadata must still be retained. Hybrid agreement preserves configuration/platform equality.

Docker `repositories` metadata has a separate layer-identity domain: the qualified classic export records the final layer's DiffID, not the configuration digest. Validate each redundant repository/tag against the same manifest's verified layer association, retaining undeclared/conflicting-reference refusal; never ignore the map or admit layer IDs as engine identities. Real Docker29.1.3 export bytes and its exact Moby exporter revision govern this regression, not a fake fixture that labels a configuration ID as a layer ID.

Build/pull, save to owned staging, parse, derive the configuration-based reference, verify the observed engine identity, refuse conflicting tags, tag and save the final reference. Reparse final bytes and verify all roles before publishing. A second save is permitted because rewriting archive tags would create a separate serializer and invalidate descriptor chains. Retire the first owned temporary archive before the final save; no startup re-export, build or pull.

Use one accepted-identity helper across pre-load conflicts, loaded/local verification and recovery. Never compare raw engine IDs to configuration-only fields. Existing references whose actual engine IDs are verified for the selected image are accepted; foreign mappings fail before load. Recovery's existing selected-release stack-container checks use actual `Image`, not mutable `Config.Image` text or unnecessary numerical equality between acceptable representations. Workspace-sandbox attribution remains based on its existing chat, name, label and mount predicates; adding a new release-image authorization requirement to that separate predicate is outside this identity-comparison repair.

## Persisted readers and rollback

Keep inventory format2 and the configuration field's meaning. New source-consumer contract2 understands descriptor metadata; new builds require selected source contract2 before Docker mutation. Readers accept existing contract1 inventories only with config-only records, preserving previously valid classic-store import/rollback; their bundled contract1 source must still match the inventory. Contract2 accepts config-only classic records as well as content-verified descriptor records. Unknown contracts, contract1 descriptor fields, mismatched bundled readers and format1 fail closed. This preserves valid stored data through the same implementation, not a duplicate legacy path. Broken artifacts that mislabeled an engine ID as configuration are not repaired silently.

## Must preserve and sibling surfaces

Keep seven-role selection, qualified DocumentServer recipe/base, pinned fonts, source/material provenance, content-derived workspace naming, platform checks, parser traversal/member/byte limits, same-staged-bytes verification/load, no undeclared archive tags, no conflicting overwrite, local-daemon locking, cancellation cleanup, existing-destination refusal and no removal of unrelated images. Startup and recovery refuse before network/firewall/container/data mutation. Previous complete releases and valid config-only rollback remain usable; no credentials enter inventories or logs.

Sibling audit covers `reject_existing_conflicts`, `reject_output_conflict`, `expected_imported_refs`, `verify_archive_set`, `verify_loaded_images`, `verify_local_images`, bootstrap/up/version-record entrypoints and recovery capture/restore/activation/helper-image paths. Update existing operator docs, changelog and the central identity decision without changing unrelated role recipes or dependency pins.

## Seams, verification and containment

Regression oracles target real archives and public release/consumer outcomes: descriptor versus config, wrong descriptor/config/platform, existing-name conflicts, source-contract mismatch, unchanged installed release on failure and no pre-verification load. Preserve existing cancellation/concurrency/archive/source/font tests. Parent owns executable checks and frozen receipts; implementer cannot edit this contract or acceptance receipts.

Actual boundary evidence must execute CLI build/export/verify/import/load with an owned committed seven-role source fixture on local descriptor-ID and classic config-ID engines, preserve required qualified-role constraints, and record all input/engine/archive identities. Existing synthetic source-fixture helpers may supply isolated materials; Docker itself is real, not replaced. This proves the release protocol, not production-image functionality. Include clean-store import, identical re-import, forged descriptor refusal before load, actual loaded/local checks and created stack-container identity checks; no LAN deployment. If a required engine cannot be qualified, retain the blocker instead of claiming source-only completion.

Review focus: descriptor ancestry cannot broaden trust; archive and runtime identity domains agree; old valid config-only rollback is preserved; bundled-reader capability is checked before mutation; failures retain publication and resource ownership guarantees. Rollback of code uses Git; failed verification never publishes a candidate release, changes unrelated tags or alters engine-wide configuration. Supported paths are evidence-qualified local Docker Engine/Desktop stores; remote daemons, Podman release transport, Windows and multi-platform publication remain outside this change.
