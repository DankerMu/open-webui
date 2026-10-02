# ocu-offline-image-delivery Specification

## Purpose

Deliver the WebUI fork and OCU deployment as content-verified local images and required source assets, with fail-closed import and startup independent of WAN access.

## Requirements

### Requirement: Complete release identity

A release SHALL identify exactly the workspace, computer-use-server, retention-guard, proxy, open-webui and PostgreSQL images for linux/amd64. It SHALL record both repository commits, named references, image configuration digests, archive SHA-256 values, non-secret build arguments and material versions/input hashes. Registry manifest digests SHALL NOT be conflated with image configuration digests. The workspace reference SHALL preserve its production image-name contract.

#### Scenario: Build from explicit sources

- **WHEN** an operator builds a release from committed OCU and WebUI fork checkouts
- **THEN** five source images and the selected PostgreSQL image are exported with inspected identities and provenance, including local Pyodide and Draw.io materials
- **AND** untracked files, credentials and unrelated sibling generated files are excluded from source inputs

#### Scenario: Incomplete or drifted inventory

- **WHEN** a role is missing, duplicated, unexpected, wrong-platform or does not match its inspected identity
- **THEN** release publication or import fails without publishing a complete release or installation

### Requirement: Offline import integrity

The delivered release SHALL include required tracked deployment and initializer source assets. Import SHALL verify its inventory, all archive checksums and confined regular-file paths before loading images. It SHALL reject a conflicting existing named reference, validate all loaded identities, and publish the installation only after success. Concurrent publication and existing destinations SHALL fail closed; failure SHALL NOT remove unrelated images or existing installations.

#### Scenario: Damaged or unsafe delivery

- **WHEN** an archive is missing, modified, symlinked or referenced outside the release root
- **THEN** import rejects it before image loading or installation publication

#### Scenario: Interrupted import

- **WHEN** loading or source reconstruction fails
- **THEN** no partial installation or success record is published, existing installations remain unchanged, and any retained image-cache side effect is reported rather than hidden by destructive cleanup

### Requirement: Content-verified startup

Bootstrap and deployment SHALL require the release inventory and bind both source identities and all six image references to it. Every deployment start SHALL verify local image identity and resolved service mappings before network, firewall or container mutation. Startup SHALL forbid image builds and pulls while preserving checked frozen Compose snapshots, proxy-only publication, sandbox isolation, disabled cleanup profiles and sibling services in the shared project. Bootstrap SHALL retain its existing secret/no-overwrite contract.

#### Scenario: Missing or replaced local image

- **WHEN** a required named reference is absent or resolves to a different configuration digest
- **THEN** startup exits nonzero before deployment mutation and performs no build or pull

#### Scenario: Source or service image mismatch

- **WHEN** the deployment checkout or resolved service image differs from the inventory
- **THEN** startup fails before provisioning or service startup

### Requirement: Offline runtime policy and truthful provenance

The deployment SHALL use existing offline/update/download switches and preserve configured LAN model/RAG endpoints and local browser materials. Its existing deployment-version record SHALL cover all six images, both source commits and build/material provenance without secrets. Input hashes and declared build arguments SHALL NOT be represented as observed installed package versions.

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
