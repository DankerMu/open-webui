# Spec Delta

## MODIFIED Requirements

### Requirement: Complete release identity

A release SHALL identify exactly the workspace, computer-use-server, retention-guard, proxy, open-webui, PostgreSQL and DocumentServer images for linux/amd64, seven roles. It SHALL record both repository commits, named references, image configuration digests, archive SHA-256 values, non-secret build arguments and material versions/input hashes. Registry manifest digests SHALL NOT be conflated with image configuration digests. The workspace reference SHALL preserve its production image-name contract. DocumentServer SHALL be a pulled, unmodified upstream image like PostgreSQL, recorded by its image configuration digest and archive SHA-256; no derived DocumentServer image SHALL be built.

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

### Requirement: Content-verified startup

Bootstrap and deployment SHALL require the release inventory and bind both source identities and all seven image references to it. Every deployment start SHALL verify local image identity and resolved service mappings before network, firewall or container mutation. Startup SHALL forbid image builds and pulls while preserving checked frozen Compose snapshots, proxy-only publication, sandbox isolation, disabled cleanup profiles and sibling services in the shared project. Bootstrap SHALL retain its existing secret/no-overwrite contract.

#### Scenario: Missing or replaced local image

- **WHEN** a required named reference is absent or resolves to a different configuration digest
- **THEN** startup exits nonzero before deployment mutation and performs no build or pull

#### Scenario: Source or service image mismatch

- **WHEN** the deployment checkout or resolved service image differs from the inventory
- **THEN** startup fails before provisioning or service startup

#### Scenario: DocumentServer image missing or replaced

- **WHEN** the DocumentServer named reference is absent locally, resolves to a different configuration digest, or the resolved DocumentServer service image differs from the inventory
- **THEN** startup exits nonzero before deployment mutation and does not pull the upstream image

### Requirement: Offline runtime policy and truthful provenance

The deployment SHALL use existing offline/update/download switches and preserve configured LAN model/RAG endpoints and local browser materials. Its existing deployment-version record SHALL cover all seven images, both source commits and build/material provenance without secrets. Input hashes and declared build arguments SHALL NOT be represented as observed installed package versions.

#### Scenario: Record generation

- **WHEN** the deployment record is generated for a verified release
- **THEN** it describes the exact release and runtime policy, including proxy and WebUI identities, and contains no provider or generated service credentials

#### Scenario: Air-gapped restart

- **WHEN** the release is imported onto a clean supported engine and the configured LAN deployment restarts with WAN blocked
- **THEN** required HTML, Office, font, Terminal, Browser, local Draw.io and supported Pyodide fixtures function with no WAN attempt, build or pull
- **AND** effective settings are checked for both fresh and preserved configuration rather than inferred only from environment declarations
