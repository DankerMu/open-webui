## ADDED Requirements

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
