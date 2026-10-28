## ADDED Requirements

### Requirement: Import skips present roles and checks free space first

Import SHALL treat a role as present when its reference already resolves locally to an image identity the inventory accepts for that role on the expected platform, using the same identity rule as the final loaded-image verification. Every role's delivery archive, present or not, SHALL be checksum-verified and inspected once, before anything is copied or loaded; a present role SHALL NOT be copied into the stage or loaded. Every other role SHALL be imported as before. The final verification SHALL still check every role. Before copying anything, import SHALL check that the stage filesystem can hold the archives it will copy plus headroom, and that Docker's data root can hold three times the size of the archives it will load plus headroom, requiring the sum with the headroom counted once when they are the same filesystem, and SHALL otherwise refuse without staging or loading anything, naming the needed and available space.

#### Scenario: Unchanged roles are not copied or loaded

- **GIVEN** a delivery in which some roles' images are already present with accepted identities
- **WHEN** the release is imported
- **THEN** only the other roles are copied and loaded, every archive is still checksum-verified first, and the installation is published after every role passes the final verification

#### Scenario: A present image with a foreign identity is not trusted

- **WHEN** a role's reference is present with an identity the inventory does not accept, or on another platform
- **THEN** the role is not skipped, and import refuses with the existing conflict or platform message before anything is loaded

#### Scenario: Too little free space refuses before any copy

- **WHEN** the stage filesystem or Docker's data root lacks the required space
- **THEN** import refuses before copying or loading anything and names the needed and available space

#### Scenario: Recovery output is unchanged

- **WHEN** recovery restore or activate imports a release with present roles
- **THEN** the import summary is written only to standard error and the command's standard output is unchanged
