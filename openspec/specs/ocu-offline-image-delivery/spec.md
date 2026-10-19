# ocu-offline-image-delivery Specification

## Purpose

Deliver the WebUI fork and OCU deployment as content-verified local images and required source assets, with fail-closed import and startup independent of WAN access.

## Requirements

### Requirement: Complete release identity

A release SHALL identify exactly the workspace, computer-use-server, retention-guard, proxy, open-webui, PostgreSQL and DocumentServer images for linux/amd64, seven roles. It SHALL record both repository commits, named references, image configuration digests, archive SHA-256 values, non-secret build arguments and material versions/input hashes. Registry manifest digests SHALL NOT be conflated with image configuration digests. The workspace reference SHALL preserve its production image-name contract. DocumentServer SHALL be built from the selected committed, B1-qualified derivative recipe and its immutable base. Its configuration digest, archive SHA-256 and exact build inputs SHALL be recorded through the existing built-role mechanism. A pulled original image SHALL NOT satisfy the derivative role.

A release SHALL also carry the open-source CJK fonts DocumentServer needs as a font bundle, a non-image member of the release package recorded like the source bundle. The fonts SHALL be pinned by a tracked file, `deploy/fonts/fonts.json`, that names each upstream archive with its SHA-256, each font file taken from it with its name, SHA-256 and size, and the licence file; the bundle's font files SHALL NOT be tracked in either repository. This change SHALL add no font binary and SHALL preserve existing unrelated font assets. The release build SHALL fetch the pinned archives, verify every SHA-256 and write `fonts.tar` holding exactly the listed font files and the licence text, and the inventory SHALL record it in a top-level field `font_bundle` with `path` and `sha256`. The inventory `format_version` SHALL be 2 for an inventory with seven roles and a font bundle. Every load of an inventory — by the release command line (build, import and verify), by the deployment entry and by recovery (`ocu-backup-rollback`) — SHALL require version 2. A version-1 inventory, six roles and no font bundle, SHALL be refused naming the unsupported format version; no code path SHALL accept two formats. Import SHALL verify the bundle's SHA-256 against the inventory, extract regular files only into `fonts/` in the install root, verify each extracted file against `fonts.json` of the release's source, and fail without publishing an installation when anything differs.

#### Scenario: Build from explicit sources

- **WHEN** an operator builds a release from committed OCU and WebUI fork checkouts
- **THEN** six source images, including the qualified DocumentServer derivative, and the selected PostgreSQL image are exported with inspected identities and provenance, including local Pyodide and Draw.io materials
- **AND** untracked files, credentials and unrelated sibling generated files are excluded from source inputs

#### Scenario: Incomplete or drifted inventory

- **WHEN** a role is missing, duplicated, unexpected, wrong-platform or does not match its inspected identity
- **THEN** release publication or import fails without publishing a complete release or installation

#### Scenario: DocumentServer is a qualified built role

- **WHEN** a release is built
- **THEN** DocumentServer is built from the selected committed recipe and approved immutable base, exported with configuration identity, archive checksum and build provenance
- **AND** an inventory that lacks the role, substitutes pulled-original provenance or escapes the qualified recipe is rejected before loading or deployment mutation

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

### Requirement: Offline import integrity

The delivered release SHALL include required tracked deployment and initializer source assets. Import SHALL verify its inventory, all archive checksums and confined regular-file paths before loading images. It SHALL reject a conflicting existing named reference, validate all loaded identities, and publish the installation only after success. Concurrent publication and existing destinations SHALL fail closed; failure SHALL NOT remove unrelated images or existing installations.

#### Scenario: Damaged or unsafe delivery

- **WHEN** an archive is missing, modified, symlinked or referenced outside the release root
- **THEN** import rejects it before image loading or installation publication

#### Scenario: Interrupted import

- **WHEN** loading or source reconstruction fails
- **THEN** no partial installation or success record is published, existing installations remain unchanged, and any retained image-cache side effect is reported rather than hidden by destructive cleanup

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

### Requirement: Separate source and release acceptance

Docker-free source evidence SHALL prove validation and failure ordering without claiming engine behavior. Actual image build, clean-store import, image platform/entrypoint compatibility and WAN-free restart SHALL remain required acceptance in final issue36 after all source development. Issue33 SHALL remain open until those criteria pass.

#### Scenario: Source-only delivery

- **WHEN** source/fake-boundary tests and cross-review pass before Docker execution is allowed
- **THEN** the source PR can merge with the release criteria explicitly pending, without closing issue33 or declaring deployment acceptance

### Requirement: Bind imported references and consumed source bytes

Before any image load, import SHALL bind every archive-internal reference and configuration digest to the release inventory and reject undeclared, ambiguous or conflicting references. Inspection and load SHALL consume the same verified staged bytes. Before deployment mutation, the consumed tracked deployment and initializer files SHALL match the bundled commit, not merely its HEAD identifier.

#### Scenario: Extra conflicting image tag

- **WHEN** an otherwise checksum-valid archive includes an undeclared tag already assigned to an unrelated local image
- **THEN** import rejects it before load and leaves all existing mappings unchanged

#### Scenario: Modified initializer at unchanged HEAD

- **WHEN** local image identities and HEAD match but a tracked initializer or deployment file differs from the release
- **THEN** startup rejects before network, firewall or container mutation
- **AND** unrelated untracked files alone do not invalidate the release

### Requirement: Approved workspace Node runtime

The linux/amd64 workspace image SHALL use the official fixed linux-x64 Node.js22.23.2 distribution and its bundled npm10.9.8. Existing node>=22.20.0 and npm>=10.9.3 engine floors and declared business dependency ranges SHALL remain unchanged. Acceptance SHALL require a complete image build with no runtime-incompatibility EBADENGINE diagnostics and observed installed versions from that image; host output or a partial image SHALL NOT substitute for this evidence.

#### Scenario: Runtime and dependency compatibility

- **WHEN** the complete candidate workspace image is built and inspected
- **THEN** its platform is linux/amd64 and its installed runtime reports Node22.23.2/npm10.9.8 satisfying unchanged engine declarations
- **AND** the complete dependency-install log contains no runtime-incompatibility EBADENGINE warning or error

#### Scenario: Incomplete build or unsupported runtime

- **WHEN** the full build fails, the installed runtime differs, or dependency engine incompatibility remains
- **THEN** this issue remains unaccepted without weakening engine declarations, substituting host results or asserting that the historical npm timeout was caused by the version mismatch

### Requirement: Executable bundled Node tool acceptance

Acceptance SHALL exercise tools inside the same complete immutable workspace image as the assistant user, using installed packages and browser assets. Mermaid SHALL render a minimal graph whose SVG contains the expected graph content. tsx SHALL execute a typed fixture with the expected result. tsc SHALL emit JavaScript with the expected behavior and reject an ill-typed fixture. Local pdfjs-dist SHALL read an actual PDF and return its expected page count and text. Version strings or import-only probes SHALL NOT replace these results.

#### Scenario: Actual tool outputs

- **WHEN** the default image harness runs its Node tool probes without WAN access
- **THEN** rendered SVG, compiled/executed TypeScript and parsed PDF results satisfy their independent assertions
- **AND** command failures preserve diagnostic evidence, return failure and leave no owned disposable test resources

### Requirement: Release identities retain their semantic domains

A release image's `configuration_digest` SHALL be the SHA-256 of its archive configuration bytes, and its content-derived reference SHALL use that digest. Optional `descriptor_digests` SHALL identify only hash-verified image-manifest or ancestor-index objects that bind the same archive reference, linux/amd64 platform and configuration. Raw engine IDs, registry observations and descriptor claims SHALL NOT establish configuration identity or authorize an otherwise unrelated image. The producer SHALL verify its final complete archive set before publication; import SHALL verify the same staged bytes and all claimed identity relationships before any image load.

#### Scenario: Engine reports a manifest or index identity

- **WHEN** a supported local engine's inspected image ID differs from the exported configuration digest but equals a verified descriptor for that image
- **THEN** the published inventory and content-derived reference use the actual configuration digest
- **AND** the separately recorded descriptor identities explain the engine identity without relabeling it as configuration

#### Scenario: Descriptor metadata is forged or unrelated

- **WHEN** a descriptor claim is malformed, duplicated, unverified, an attestation, or belongs only to another image or platform
- **THEN** release publication or import refuses before publishing a release or loading images
- **AND** a recomputed outer archive checksum does not authorize the false relationship

#### Scenario: Final archive differs from the verified image

- **WHEN** the final export's references, platform, configuration or claimed descriptor relationship differ from the image record
- **THEN** publication fails with no complete release at the destination
- **AND** existing unrelated tags and releases remain unchanged

#### Scenario: Classic-store repository metadata names the final layer

- **WHEN** a supported classic-store export's `repositories` map identifies the final layer of the same manifest rather than its configuration digest
- **THEN** archive verification validates that layer association and accepts the valid reference without relabeling the layer as configuration or engine identity
- **AND** an undeclared repository/tag or a layer identity belonging to another manifest is rejected before publication or load

### Requirement: Runtime and recovery consume verified engine identities

Existing-reference checks, loaded-image verification, installed-image verification, bootstrap and recovery's existing selected-release stack-container image checks SHALL use the selected inventory's verified identity domains. Each engine ID compared by these checks SHALL match its configuration digest or a verified descriptor for that selected image, with the required platform. Stack-container checks SHALL inspect actual image identity rather than trusting configured image-name strings. Existing workspace-sandbox attribution predicates SHALL remain unchanged. Provenance SHALL label configuration and engine identities distinctly. Startup checks SHALL NOT re-export images, build, pull or mutate deployment resources to establish identity.

#### Scenario: Valid descriptor-ID image is loaded and reused

- **WHEN** a verified release is imported onto a supported descriptor-ID engine and then imported again or verified for startup
- **THEN** the same valid image is accepted even though its engine ID is not the configuration digest
- **AND** no false existing-tag conflict or configuration-digest mismatch is reported

#### Scenario: Selected reference or container points to a foreign image

- **WHEN** a named reference or a stack container's actual image is outside the selected image's verified identity set, even if its configured image-name string matches
- **THEN** import, startup or recovery refuses before the corresponding image-load, deployment or quiescence mutation
- **AND** no unrelated mapping is overwritten and no writer is stopped by a failed recovery identity check

#### Scenario: Valid container uses an accepted engine representation

- **WHEN** a stack container's actual image belongs to the selected release's verified identity set and the required service, project and data bindings also match
- **THEN** the identity gate accepts it without comparing its engine ID to the configuration field alone
- **AND** existing project, service, mount, environment and data-safety checks remain mandatory

### Requirement: Reader capability preserves valid classic deliveries

New release producers SHALL require source-consumer contract2 in the selected committed source before Docker mutation. Contract2 readers SHALL support existing valid contract1 format2 inventories only as config-only records, and SHALL require the bundled source contract to match the inventory. Contract1 inventories SHALL NOT claim descriptor identities. Contract2 config-only records SHALL remain supported on classic engines. Unknown contracts and format1 SHALL fail closed. No failed historical release with a mislabeled configuration digest SHALL be silently repaired or accepted. Supported Engine/Desktop store and build/export paths, local-daemon restrictions and unsupported release transports SHALL be documented from actual evidence.

#### Scenario: New producer selects an incapable bundled reader

- **WHEN** a new build selects committed source that does not implement contract2
- **THEN** it refuses before building, pulling, tagging or publishing release images

#### Scenario: Previously valid classic release is retained for rollback

- **WHEN** an existing contract1 format2 config-only release with matching bundled source is imported, verified or selected for recovery on its supported classic engine
- **THEN** it retains the configuration-based identity and content-reference behavior
- **AND** it remains usable through the same verified release and recovery mechanisms

#### Scenario: Contract1 inventory claims descriptor support

- **WHEN** a contract1 inventory includes descriptor identities or the bundled reader contract differs from its declaration
- **THEN** import or verification refuses before image load or deployment mutation

#### Scenario: Qualified real release protocol

- **WHEN** isolated committed release inputs exercise the actual CLI build, export, verification, import and load on documented descriptor-ID and classic config-ID engines
- **THEN** independent archive parsing agrees with every configuration field and content reference, and actual loaded/local/container identity checks succeed
- **AND** raw evidence distinguishes release-protocol fixtures from production-image, WAN-free or LAN acceptance; source-only and fake-engine outcomes do not substitute for these executions
