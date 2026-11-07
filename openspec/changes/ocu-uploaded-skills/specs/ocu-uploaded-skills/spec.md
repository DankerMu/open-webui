# Spec Delta

## Purpose

Let administrators upload, replace, delete and grant access to OCU skills packaged as ZIP files, rejecting archives that could escape their directory, exhaust resources or shadow a built-in skill.

## ADDED Requirements

### Requirement: Administrator-only lifecycle

Upload, list-all, access update and delete of uploaded skills SHALL require an authenticated administrator. A non-administrator SHALL receive 401 for every one of these endpoints, and an unauthenticated caller SHALL receive 401. When `ENABLE_OCU_WORKSPACE` is not `true`, every endpoint of this capability SHALL return 404.

#### Scenario: Non-administrator upload refused
- **WHEN** an authenticated user with role `user` posts a valid ZIP to the upload endpoint
- **THEN** the response is 401 and no skill row, grant or stored file is created

#### Scenario: Workspace disabled
- **WHEN** `ENABLE_OCU_WORKSPACE` is `false` and an administrator calls the upload, list-all, access or delete endpoint
- **THEN** each response is 404

### Requirement: Upload creates a skill visible to everyone

A first upload of a valid ZIP SHALL create a skill whose name is the `SKILL.md` frontmatter `name` and whose description is the frontmatter `description`, store the ZIP, record its SHA-256 and size, and write exactly one read access grant to the wildcard principal `user:*`.

#### Scenario: First upload
- **WHEN** an administrator uploads a valid ZIP whose `SKILL.md` declares `name: invoice-builder` and a description
- **THEN** the response is 200 with name `invoice-builder`, the description, the SHA-256 of the uploaded bytes and the size, and the skill has a single `user:*` read grant

### Requirement: Re-upload replaces in place

Uploading a valid ZIP whose frontmatter name equals an existing skill SHALL replace that skill's stored ZIP, SHA-256, size and description, and SHALL leave its access grants and every user's disable state unchanged. The previous stored ZIP SHALL be removed only after the replacement is committed.

#### Scenario: Replace keeps grants and disables
- **WHEN** skill `invoice-builder` has its grant narrowed to group A and user U has disabled it, and an administrator uploads a different valid ZIP named `invoice-builder`
- **THEN** the SHA-256 changes to the new bytes, the grants are exactly group A read, and U's skill is still disabled

### Requirement: ZIP validation

The upload SHALL return 400 with a reason, and SHALL leave stored files, skill rows, grants and disable rows unchanged, when any of the following holds:
- an entry has an absolute path, a `..` component or a backslash;
- an entry is a symbolic link or is encrypted;
- the archive has more than 2000 entries;
- the uncompressed total, counted from bytes actually read, exceeds 200 MB;
- after stripping a single shared top-level directory, there is no root `SKILL.md`, or its frontmatter lacks a `name` matching `^[a-z0-9][a-z0-9-]{0,63}$` or a non-empty `description`;
- the body is not a ZIP.

A body larger than 50 MB SHALL return 413 with the same no-change guarantee.

#### Scenario: Path traversal rejected
- **WHEN** an administrator uploads a ZIP containing a valid `SKILL.md` and an entry `../../evil.sh`
- **THEN** the response is 400 and the skill list, storage and grants are unchanged

#### Scenario: Zip bomb rejected
- **WHEN** an administrator uploads a 300 KB ZIP whose entries decompress to more than 200 MB
- **THEN** the response is 400 and nothing is stored

#### Scenario: Oversized body rejected
- **WHEN** an administrator uploads a 51 MB body
- **THEN** the response is 413 and nothing is stored

#### Scenario: Wrapped directory accepted
- **WHEN** every entry sits under `invoice-builder/` and `invoice-builder/SKILL.md` has valid frontmatter
- **THEN** the upload succeeds as if the files were at the root

#### Scenario: Missing description rejected
- **WHEN** `SKILL.md` frontmatter has a valid `name` and no `description`
- **THEN** the response is 400 and nothing is stored

### Requirement: Reserved built-in names

An upload whose frontmatter name equals a reserved built-in name SHALL return 400 and change nothing. The reserved list SHALL contain every directory name under OCU `skills/public/` at the pinned OCU revision, plus `remotion`. A test SHALL fail when the list does not cover that directory set. The test SHALL also fail, rather than skip, when the OCU checkout is absent.

#### Scenario: Built-in name rejected
- **WHEN** an administrator uploads a valid ZIP whose frontmatter name is `docx`
- **THEN** the response is 400 and the built-in `docx` remains the only `docx` OCU lists

#### Scenario: Drift detected
- **WHEN** the pinned OCU checkout contains a `skills/public/` directory missing from the reserved list
- **THEN** the drift test fails naming that directory

### Requirement: Access update

An administrator SHALL be able to replace a skill's read grants with any set of users, groups and the `user:*` wildcard, using the same grant format as other access-controlled resources. Updating the access of an unknown skill SHALL return 404.

#### Scenario: Narrow to a group
- **WHEN** an administrator replaces `invoice-builder` grants with group A read only
- **THEN** a member of group A holds read access and a non-member does not

### Requirement: Hard delete

Deleting a skill SHALL remove its row, its stored ZIP, all its access grants and every user's disable state for it. Deleting an unknown skill SHALL return 404.

#### Scenario: Delete removes everything
- **WHEN** an administrator deletes `invoice-builder`, which has grants and disable rows
- **THEN** the skill is absent from every list, no `ocu_skill` grant or disable row remains for it, and its stored file no longer exists
