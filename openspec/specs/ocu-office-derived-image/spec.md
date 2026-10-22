# ocu-office-derived-image Specification

## Purpose

Qualify a minimal DocumentServer derivative whose native editor initialization is independent of module arrival order, with source-bound image identities and unchanged Office security and acceptance guarantees.

## Requirements

### Requirement: Native UI providers precede their consumers

The qualified DOCX, XLSX and PPTX desktop editor entrypoints SHALL establish their shared UI base providers after framework and locale readiness and before requesting dependent controller/view factories. Provider delay SHALL delay those consumers rather than raise an undefined-base initialization error. Authentication, editor operations, native browser restrictions, callback behavior and existing timeouts SHALL remain unchanged.

#### Scenario: Base provider arrives late

- **WHEN** a real native editor's base-provider module dispatch is delayed while other module responses remain available
- **THEN** dependent controller/view factories wait for the provider and the editor becomes usable after its release without an undefined-base page error
- **AND** the original image's same controlled ordering remains a retained failing counterexample, not an accepted result

#### Scenario: Locale and framework globals are available

- **WHEN** any of the three desktop editors initializes
- **THEN** shared UI providers observe the existing framework globals and locale initialization before their consumers run
- **AND** the patch does not replace native edits with an API mutation or suppress browser errors

### Requirement: Derivative mutation is confined and fail-closed

The derivative SHALL use the approved immutable base and a tracked, reviewed patch inventory. It SHALL verify exact original and resulting bytes before accepting a patch, preserve unrelated image content and identify its modifications without removing upstream notices. A mismatched source, missing target, ambiguous edit or already altered input SHALL fail the build; it SHALL NOT produce a successful partially patched artifact or mutate the original image.

#### Scenario: Approved recipe builds

- **WHEN** the recipe is applied to the exact approved base
- **THEN** the resulting filesystem differs only at the declared native bootstrap and modification/provenance notice paths
- **AND** server binaries, fonts, entrypoint, command and runtime configuration remain unchanged, with layer/file evidence retained

#### Scenario: Input does not match the patch inventory

- **WHEN** a target has unexpected bytes, is absent, or an edit is not uniquely applicable
- **THEN** preflight rejects before writing any target and no qualified derivative is published

### Requirement: Selected-source qualification binds local image use

The local verifier SHALL consume a qualified image declaration from its selected committed OCU source. That declaration SHALL bind the build recipe and the actual output identity for the selected platform. A named tag or image label alone SHALL NOT establish qualification. Registry index, platform manifest and configuration identities SHALL remain distinct. Verification SHALL neither build nor pull an image implicitly.

#### Scenario: Qualified local build has no registry digest

- **WHEN** the exact qualified locally built image is available for the Docker engine platform with no registry push
- **THEN** preflight accepts its verified artifact identity and records the actual platform and identity domains
- **AND** the existing no-pull runtime path starts that selected artifact

#### Scenario: Stale declaration or replaced image

- **WHEN** the declared recipe differs from the selected source, the platform is absent or wrong, the image is missing, or a reference resolves to a different artifact
- **THEN** verification fails naming the qualification or image prerequisite before starting runtime resources
- **AND** it does not fall back to the original image or another tag

### Requirement: Derivative acceptance preserves the B1 evidence boundary

The derivative SHALL have an owner-approved B1 decision and an evidence record identifying its base, patch scope, actual image outputs and tested platform. Historical B1 artifacts SHALL remain unchanged. Each inherited observation SHALL cite unchanged-byte evidence and retain its original limits; changed native paths SHALL have fresh real-editor evidence. The complete three-format verifier SHALL pass content checks, fresh native readback, independent LibreOffice reopening, diagnostic classification and owned-resource cleanup before this correction is accepted.

#### Scenario: Native round trips are qualified

- **WHEN** the derivative is submitted for acceptance
- **THEN** the default real target completes DOCX, XLSX and PPTX edit/save/fresh-open flows, verifies their actual published content and LibreOffice reopening, and records unjudged fidelity differences
- **AND** only the already-approved native unload-policy diagnostic is separately classified; other console errors and every page error remain fatal

#### Scenario: Evidence is platform and scope specific

- **WHEN** local ARM64 qualification or source-only release tests are reported
- **THEN** they do not imply AMD64 runtime, clean-store seven-role import, WAN-free restart, LAN deployment or acceptance-machine qualification
- **AND** the original image and evidence remain available for an explicit rollback using their matching original source and contracts

#### Scenario: Qualification ends or is interrupted

- **WHEN** an image qualification run succeeds, fails or is interrupted
- **THEN** all resources it owns are retired, unrelated resources are preserved and public evidence contains no managed credentials
- **AND** incomplete or failed runs remain failed rather than being rewritten as acceptance
