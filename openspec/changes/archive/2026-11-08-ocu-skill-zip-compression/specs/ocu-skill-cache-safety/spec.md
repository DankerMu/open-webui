## ADDED Requirements

### Requirement: Skill ZIP compression methods are bounded

OCU SHALL extract a registry skill ZIP only when every entry uses the stored or deflate method. Any other method, including bzip2 and lzma, SHALL make `ensure_skill_cached` return `None` before any entry is read. As for every other rejection, the temporary directory SHALL be removed, and the existing cache directory and manifest SHALL stay unchanged.

#### Scenario: Bzip2 entry rejected before any read

- **WHEN** the registry ZIP for skill `invoice` contains a deflate `SKILL.md` and a bzip2 entry
- **THEN** `ensure_skill_cached` returns `None` without opening any entry, and the previous `invoice` cache and manifest are unchanged

#### Scenario: Stored ZIP still cached

- **WHEN** the registry ZIP for skill `invoice` has only stored entries, including `SKILL.md`
- **THEN** `ensure_skill_cached` returns the cache path and `SKILL.md` is at the cache root
