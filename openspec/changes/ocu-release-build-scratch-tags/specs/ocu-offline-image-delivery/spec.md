## ADDED Requirements

### Requirement: Build scratch references are unique and retired

The release producer SHALL name every local scratch reference it creates while building or exporting an image with a value unique to that call, so that a reference left by an earlier build, including one from a process with the same pid, cannot collide with it. A scratch reference that is nevertheless occupied SHALL abort the build before building. For built images the producer SHALL remove its scratch reference before the build ends, without removing image content another reference still holds. On success a failed removal SHALL fail the build; on failure the removal is best effort, a failed removal is reported as a warning, and the original error is reported. It SHALL never remove a pulled upstream reference or a pre-existing reference it did not create.

#### Scenario: Successful build leaves no scratch tags

- **WHEN** a release build completes
- **THEN** no `ocu-build-*` reference created by that build remains, and the content references and upstream references remain

#### Scenario: Failed build retires its scratch tag

- **WHEN** a build fails after a role's image was built
- **THEN** that role's scratch reference is removed and the original error is reported

#### Scenario: Occupied scratch name

- **WHEN** the scratch name generated for a role is already taken
- **THEN** the build aborts before building and the existing reference is left unchanged

#### Scenario: Stale scratch tag from an earlier build

- **WHEN** an `ocu-build-{role}-{pid}` reference from an earlier build exists and the new build runs with the same pid
- **THEN** the new build does not abort on it and leaves it untouched
