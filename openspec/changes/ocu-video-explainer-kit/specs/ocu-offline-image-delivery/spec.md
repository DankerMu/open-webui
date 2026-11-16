# Spec Delta

## ADDED Requirements

### Requirement: The workspace base image is pinned by digest

The workspace image recipe, the OCU repository root `Dockerfile`, SHALL name its base image by an immutable digest, not by a tag alone. Its `ARG` lines follow the `FROM` line and do not affect base resolution.

A newly built release inventory SHALL record exactly one workspace material `{"name": "base", "kind": "base-image", "requested": "ubuntu@sha256:<64 hex>"}`, taken from the recipe's `FROM` digest. A build from a root recipe whose `FROM` has no digest SHALL fail naming the line, before any image is built.

A version-2 inventory built before this change, without a workspace base material, SHALL still pass import, verification and recovery.

A recipe whose base image has no digest SHALL fail the repository's static checks. Other Dockerfiles in the repository are out of scope.

#### Scenario: Tag moves upstream

- **WHEN** the upstream tag of the base image is repointed after a release
- **THEN** a rebuild of the same commit resolves the pinned base
- **AND** the release inventory records the same base digest as before

#### Scenario: Undigested base is rejected

- **WHEN** the root `Dockerfile`'s `FROM` line has no `@sha256:` digest
- **THEN** the static check fails naming the line

#### Scenario: Older release still usable

- **WHEN** an operator verifies, imports or retargets to the release built before this change
- **THEN** it is accepted without a workspace base material

#### Scenario: Undigested recipe fails the build

- **WHEN** a release build runs on a checkout whose root `Dockerfile` names `ubuntu:24.04` without a digest
- **THEN** the build fails naming the line, and no inventory is written
