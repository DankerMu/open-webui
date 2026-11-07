# ocu-skill-cache-safety Specification

## Purpose

TBD - created by archiving change ocu-skill-zip-safety. Update Purpose after archive.

## Requirements

### Requirement: Skill ZIP extraction stays inside the cache

OCU SHALL extract a registry skill ZIP only when every entry is a directory or a regular file (an entry without Unix type bits counts as regular) whose raw path, before any top-level-directory stripping, is relative, contains no `..` component and no backslash, and resolves inside the extraction directory, the archive has at most 2000 entries, and the bytes actually read total at most 200 MB. Otherwise `ensure_skill_cached` SHALL return `None`, SHALL remove its temporary directory, and SHALL leave the existing cache directory and manifest unchanged.

#### Scenario: Traversal entry rejected

- **WHEN** the registry ZIP for skill `invoice` contains `SKILL.md` and `../../REL_ESCAPE`
- **THEN** `ensure_skill_cached` returns `None`, no file exists outside `SKILLS_CACHE_DIR`, and the previous `invoice` cache and manifest are unchanged

#### Scenario: Decompression bomb rejected

- **WHEN** the registry ZIP is under `MAX_ZIP_SIZE` but its entries inflate past 200 MB
- **THEN** `ensure_skill_cached` returns `None` and no temporary extraction directory remains

### Requirement: Registry skill names are validated

OCU SHALL drop every registry skill whose name does not fully match `[a-zA-Z0-9][a-zA-Z0-9._-]*` (no trailing newline) or contains `..`, before the name is used in any path.

#### Scenario: Traversal name dropped

- **WHEN** the registry returns a skill named `../outside-rel`
- **THEN** `get_user_skills` does not list it and `get_skill_mounts` produces no mount for it
