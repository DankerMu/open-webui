# Spec Delta

## MODIFIED Requirements

### Requirement: Complete release identity

A release SHALL identify exactly the workspace, computer-use-server, retention-guard, proxy, open-webui, PostgreSQL and DocumentServer images for linux/amd64, seven roles. It SHALL record both repository commits, named references, image configuration digests, archive SHA-256 values, non-secret build arguments and material versions/input hashes. Registry manifest digests SHALL NOT be conflated with image configuration digests. The workspace reference SHALL preserve its production image-name contract. DocumentServer SHALL be a pulled, unmodified upstream image like PostgreSQL, recorded by its image configuration digest and archive SHA-256; no derived DocumentServer image SHALL be built.

A release SHALL also carry the open-source CJK fonts DocumentServer needs as a font bundle, a non-image member of the release package recorded like the source bundle. The fonts SHALL be pinned by a tracked file, `deploy/fonts/fonts.json`, that names each upstream archive with its SHA-256, each font file taken from it with its name, SHA-256 and size, and the licence file; the bundle's font files SHALL NOT be tracked in either repository. This change SHALL add no font binary and SHALL preserve existing unrelated font assets. The release build SHALL fetch the pinned archives, verify every SHA-256 and write `fonts.tar` holding exactly the listed font files and the licence text, and the inventory SHALL record it in a top-level field `font_bundle` with `path` and `sha256`. The inventory `format_version` SHALL be 2 for an inventory with seven roles and a font bundle. Every load of an inventory — by the release command line (build, import and verify), by the deployment entry and by recovery (`ocu-backup-rollback`) — SHALL require version 2. A version-1 inventory, six roles and no font bundle, SHALL be refused naming the unsupported format version; no code path SHALL accept two formats. Import SHALL verify the bundle's SHA-256 against the inventory, extract regular files only into `fonts/` in the install root, verify each extracted file against `fonts.json` of the release's source, and fail without publishing an installation when anything differs.

#### Scenario: Build from explicit sources

- **WHEN** an operator builds a release from committed OCU and WebUI fork checkouts
- **THEN** five source images and the selected PostgreSQL and DocumentServer images are exported with inspected identities and provenance, including local Pyodide and Draw.io materials
- **AND** untracked files, credentials and unrelated sibling generated files are excluded from source inputs

#### Scenario: Incomplete or drifted inventory

- **WHEN** a role is missing, duplicated, unexpected, wrong-platform or does not match its inspected identity
- **THEN** release publication or import fails without publishing a complete release or installation

#### Scenario: DocumentServer is a pulled role

- **WHEN** a release is built
- **THEN** the DocumentServer image is the selected upstream image, exported unmodified and recorded by configuration digest and archive SHA-256
- **AND** an inventory that lacks the DocumentServer role, or that records it as a built image, is rejected

#### Scenario: Selected release identity reaches runtime consumers

- **WHEN** bootstrap or restore selects a valid version2 release with seven image roles
- **THEN** the runtime configuration records `DOCUMENTSERVER_IMAGE` from that inventory alongside the other six references
- **AND** a stale captured DocumentServer reference cannot override the selected release
- **AND** the deployment version record includes its inspected runtime configuration digest without exposing credentials

#### Scenario: Image identity is independent of service introduction

- **WHEN** task28.1 verifies a valid seven-role release before the DocumentServer compose service is introduced
- **THEN** all seven local image identities are checked, while the existing compose service set remains accepted
- **AND** a missing or replaced DocumentServer image fails before deployment mutation without building or pulling

#### Scenario: Font bundle is built from the pin

- **WHEN** a release is built
- **THEN** the package holds `fonts.tar` with exactly the font files and the licence text that `deploy/fonts/fonts.json` lists, the inventory's `font_bundle` records its path and SHA-256, and the inventory's `format_version` is 2
- **AND** a pinned archive or a font file whose SHA-256 differs from the pin fails the build without publishing a release
- **AND** neither repository tracks a font file from this bundle, the change adds no font binary, and the package holds no font that the pin does not list

#### Scenario: Selected committed font pin is authoritative

- **WHEN** the executing checkout's font pin differs from the selected release source
- **THEN** build and import use the selected committed pin, and startup uses the pin of the verified selected source
- **AND** changing the transport bundle checksum does not permit font bytes that differ from that pin

#### Scenario: Version-1 inventory is refused

- **WHEN** the release command line is asked to import or verify a package whose inventory is version 1
- **THEN** it fails naming the unsupported format version and installs nothing
- **AND** recovery refuses the same package as a retained release, at restore and at activation, in the same way

#### Scenario: Font bundle is verified at import

- **WHEN** a release is imported
- **THEN** the install root holds `fonts/` with exactly the files of the pin, each matching its SHA-256
- **AND** a bundle whose SHA-256 differs from the inventory, a member that is not a regular file or escapes the directory, a missing `font_bundle` field, or an extracted file that differs from the pin fails the import without publishing an installation

#### Scenario: Delivery verification includes font material

- **WHEN** `release.py verify --mode delivery` checks a release with a valid bundle matching the selected source's pin
- **THEN** verification succeeds without installing the release
- **AND** an absent bundle, a wrong bundle checksum or members differing from that pin fail verification naming the font bundle, without installing anything

### Requirement: Content-verified startup

Bootstrap and deployment SHALL require the release inventory and bind both source identities and all seven image references to it. Every deployment start SHALL verify local image identity and resolved service mappings before network, firewall or container mutation. The release check that the deployment entry runs at that point SHALL also check the release font directory: the entry `fonts` beside the installed inventory SHALL hold exactly the files of the release's `fonts.json`, each with its SHA-256, so that DocumentServer is never started with a missing, emptied or altered release font directory. The check SHALL be made by the deployment entry itself, not only by a library function that nothing calls. When recovery activates a release it SHALL place `fonts` beside the inventory it publishes into the deployment root, as a link to the selected root's `fonts/`, the way it places `source`; a link that points anywhere else SHALL fail the check. Startup SHALL forbid image builds and pulls while preserving checked frozen Compose snapshots, proxy-only publication, sandbox isolation, disabled cleanup profiles and sibling services in the shared project. Bootstrap SHALL retain its existing secret/no-overwrite contract.

#### Scenario: Missing or replaced local image

- **WHEN** a required named reference is absent or resolves to a different configuration digest
- **THEN** startup exits nonzero before deployment mutation and performs no build or pull

#### Scenario: Source or service image mismatch

- **WHEN** the deployment checkout or resolved service image differs from the inventory
- **THEN** startup fails before provisioning or service startup

#### Scenario: DocumentServer image missing or replaced

- **WHEN** the DocumentServer named reference is absent locally, resolves to a different configuration digest, or the resolved DocumentServer service image differs from the inventory
- **THEN** startup exits nonzero before deployment mutation and does not pull the upstream image

#### Scenario: Release font directory missing or altered

- **WHEN** the installed `fonts/` directory is absent, empty, lacks a pinned file, holds an extra file, or holds a file whose SHA-256 differs from the pin
- **THEN** startup exits nonzero naming the font directory before deployment mutation, and no service is started

#### Scenario: Restored deployment starts with its fonts

- **WHEN** a recovery set is restored into a new deployment root, activated and started
- **THEN** `fonts` beside the published inventory resolves to the selected release root's `fonts/`, the font check passes and DocumentServer mounts those fonts
- **AND** when that entry is missing or points outside the selected release root, startup exits nonzero naming the font directory

#### Scenario: Matching bytes do not authorize a foreign font link

- **WHEN** the manifest-adjacent `fonts` entry links outside the selected release root, even to a directory with identical pinned bytes
- **THEN** startup and recovery selection refuse it without replacing that entry or starting a service

### Requirement: Offline runtime policy and truthful provenance

The deployment SHALL use existing offline/update/download switches and preserve configured LAN model/RAG endpoints and local browser materials. Its existing deployment-version record SHALL cover all seven images, both source commits and build/material provenance without secrets. Input hashes and declared build arguments SHALL NOT be represented as observed installed package versions.

#### Scenario: Record generation

- **WHEN** the deployment record is generated for a verified release
- **THEN** it describes the exact release and runtime policy, including proxy and WebUI identities, and contains no provider or generated service credentials

#### Scenario: Air-gapped restart

- **WHEN** the release is imported onto a clean supported engine and the configured LAN deployment restarts with WAN blocked
- **THEN** required HTML, Office, font, Terminal, Browser, local Draw.io and supported Pyodide fixtures function with no WAN attempt, build or pull
- **AND** effective settings are checked for both fresh and preserved configuration rather than inferred only from environment declarations
