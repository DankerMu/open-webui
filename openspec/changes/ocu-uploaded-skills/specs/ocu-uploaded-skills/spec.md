# Spec Delta

## Purpose

Let administrators upload, replace, delete and grant access to OCU skills packaged as ZIP files, rejecting archives that could escape their directory, exhaust resources or shadow a built-in skill.

## ADDED Requirements

### Requirement: Administrator-only lifecycle

Upload, list-all, access update and delete of uploaded skills SHALL require an authenticated administrator. A non-administrator SHALL receive 401 for every one of these endpoints, and an unauthenticated caller SHALL receive 401. When `ENABLE_OCU_WORKSPACE` is not `true`, every endpoint of this capability SHALL return 404.

#### Scenario: Non-administrator upload refused
- **WHEN** an authenticated user with role `user` posts a valid ZIP to the upload endpoint
- **THEN** the response is 401 and the admin listing and the grants are unchanged

#### Scenario: Workspace disabled
- **WHEN** `ENABLE_OCU_WORKSPACE` is `false` and an administrator calls the upload, list-all, access or delete endpoint
- **THEN** each response is 404

### Requirement: Upload creates a skill visible to everyone

A first upload of a valid ZIP SHALL, in one DB transaction, create a skill whose name is the `SKILL.md` frontmatter `name` and whose description is the frontmatter `description`, store the ZIP bytes in the `ocu_skill.data` column (not in `Storage` or `UPLOAD_DIR`), record its SHA-256 and size, and write exactly one read access grant to the wildcard principal `user:*`. If the commit fails, no row and no grant SHALL remain.

#### Scenario: First upload
- **WHEN** an administrator uploads a valid ZIP whose `SKILL.md` declares `name: invoice-builder` and a description
- **THEN** the response is 200 with name `invoice-builder`, the description, the SHA-256 of the uploaded bytes and the size, and the skill has a single `user:*` read grant

#### Scenario: First-upload commit failure
- **WHEN** the DB commit of a first upload of `invoice-builder` fails
- **THEN** the response is an error, `invoice-builder` is absent from the admin listing, no `ocu_skill` grant exists for it, and its download returns 404

### Requirement: Skill bytes survive upload-directory resets

Uploaded skills SHALL NOT be stored in the Open WebUI upload directory, so the existing administrator actions that empty it SHALL leave every uploaded skill listed and downloadable.

#### Scenario: Reset uploads keeps skills
- **WHEN** an administrator runs the existing "reset uploads" action and then the "delete all files" action
- **THEN** `invoice-builder` is still listed and its download returns the same bytes and SHA-256 as before

### Requirement: Re-upload replaces in place

Uploading a valid ZIP whose frontmatter name equals an existing skill SHALL replace that skill's `data`, SHA-256, size and description in one DB transaction, and SHALL leave its access grants and every user's disable state unchanged. If the commit fails, the previous row and its downloadable bytes SHALL remain unchanged.

#### Scenario: Replace keeps grants and disables
- **WHEN** skill `invoice-builder` has its grant narrowed to group A and user U has disabled it, and an administrator uploads a different valid ZIP named `invoice-builder`
- **THEN** the SHA-256 changes to the new bytes, the grants are exactly group A read, and U's skill is still disabled

#### Scenario: Replace commit failure
- **WHEN** the DB commit of a replacement upload of `invoice-builder` fails
- **THEN** the response is an error, and the listing, SHA-256, size, description and downloaded bytes of `invoice-builder` equal those before the attempt

### Requirement: ZIP validation

The upload SHALL return 400 with a reason, and SHALL leave skill rows (with their bytes), grants and disable rows unchanged, when any of the following holds:
- an entry has an absolute path, a `..` component or a backslash;
- an entry is a symbolic link or is encrypted;
- the archive has more than 2000 entries;
- the uncompressed total, counted from bytes actually read, exceeds 200 MB;
- after stripping a single shared top-level directory, there is no root `SKILL.md`, or its frontmatter lacks a `name` matching `^[a-z0-9][a-z0-9-]{0,63}$` or a non-empty `description`;
- the body is not a ZIP.

A body larger than 50 MB SHALL return 413 with the same no-change guarantee. 413 is used only for size; every other rejection SHALL return 400.

#### Scenario: Path traversal rejected
- **WHEN** an administrator uploads a ZIP containing a valid `SKILL.md` and an entry `../../evil.sh`
- **THEN** the response is 400 and the skill list and grants are unchanged

#### Scenario: Zip bomb rejected
- **WHEN** an administrator uploads a 300 KB ZIP whose entries decompress to more than 200 MB
- **THEN** the response is 400 and the skill list is unchanged

#### Scenario: Oversized body rejected
- **WHEN** an administrator uploads a 51 MB body
- **THEN** the response is 413 and the skill list is unchanged

#### Scenario: Wrapped directory accepted
- **WHEN** every entry sits under `invoice-builder/` and `invoice-builder/SKILL.md` has valid frontmatter
- **THEN** the upload succeeds as if the files were at the root

#### Scenario: Missing description rejected
- **WHEN** `SKILL.md` frontmatter has a valid `name` and no `description`
- **THEN** the response is 400 and the skill list is unchanged

### Requirement: Reserved built-in names

An upload whose frontmatter name equals a reserved built-in name SHALL return 400 and change nothing. The reserved list is hardcoded and SHALL contain every directory name under OCU `skills/public/` at the pinned OCU revision, `remotion`, and every key of `NATIVE_PROMPT_DESCRIPTIONS` in the pinned `computer-use-server/skill_manager.py` (OCU overrides those descriptions by name whatever the category). The reserved check SHALL ship with the upload route. A drift test SHALL fail when the list does not cover the directory set, `remotion` and the parsed `NATIVE_PROMPT_DESCRIPTIONS` keys. The test locates OCU through `OCU_CHECKOUT`, which defaults to `<repo root>/../open-computer-use` resolved from the repository root, not from the pytest working directory. The test SHALL also fail, rather than skip, when the OCU checkout is absent.

#### Scenario: Built-in name rejected
- **WHEN** an administrator uploads a valid ZIP whose frontmatter name is `docx`
- **THEN** the response is 400 and the built-in `docx` remains the only `docx` OCU lists

#### Scenario: Native description name rejected
- **WHEN** an administrator uploads a valid ZIP whose frontmatter name is `internal-comms`, a `NATIVE_PROMPT_DESCRIPTIONS` key with no `skills/public/` directory
- **THEN** the response is 400 and no `internal-comms` skill is created

#### Scenario: Drift detected
- **WHEN** the pinned OCU checkout contains a `skills/public/` directory or a `NATIVE_PROMPT_DESCRIPTIONS` key missing from the reserved list
- **THEN** the drift test fails naming that name

#### Scenario: Missing checkout fails
- **WHEN** no OCU checkout exists at `OCU_CHECKOUT` or its default
- **THEN** the drift test fails with a message asking for the OCU checkout, and is not skipped

### Requirement: Access update

An administrator SHALL be able to replace a skill's read grants with any set of users, groups and the `user:*` wildcard, using the same grant format as other access-controlled resources. Updating the access of an unknown skill SHALL return 404.

#### Scenario: Narrow to a group
- **WHEN** an administrator replaces `invoice-builder` grants with group A read only
- **THEN** a member of group A holds read access and a non-member does not

### Requirement: Hard delete

Deleting a skill SHALL remove, in one DB transaction, its row (with the ZIP bytes in `data`), all its access grants and every user's disable state for it. Deleting an unknown skill SHALL return 404.

#### Scenario: Delete removes everything
- **WHEN** an administrator deletes `invoice-builder`, which has grants and disable rows
- **THEN** the skill is absent from every list, no `ocu_skill` grant or disable row remains for it, and its download returns 404
