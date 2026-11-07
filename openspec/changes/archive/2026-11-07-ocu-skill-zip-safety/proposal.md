## Why

OCU's skill manager trusts the skill registry's ZIP and skill names (DankerMu/open-webui#740). A ZIP entry such as `../../x` or an absolute path writes outside `SKILLS_CACHE_DIR`, a 200 KB ZIP can inflate to hundreds of MB, and a name containing `..` makes `get_skill_mounts` bind a host directory outside the cache into the user sandbox. Today no user can reach this (the registry is unconfigured), but the WebUI uploaded-skills epic (#741) will start serving ZIPs, so OCU must not depend on the registry being trustworthy.

## What Changes

- `ensure_skill_cached` checks every ZIP entry before writing: it rejects absolute paths, `..` components, backslashes, and non-regular entries, and it requires `realpath(target)` to stay under `realpath(tmp_dir) + os.sep`. It caps the archive at 2000 entries and 200 MB uncompressed, counted from the bytes it actually reads. A rejected archive returns `None`, removes its temp directory, and leaves the existing cache directory and manifest unchanged.
- `_parse_api_skills` drops, with a log line, every registry entry whose name fails `^[a-zA-Z0-9][a-zA-Z0-9._-]*$` or contains `..`, so no later path join sees it.

## Triage

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent (issue predates the field)
Blast radius: OCU host filesystem writes outside the cache; disk exhaustion; host directories bind-mounted into sandboxes
Selected risk packs: File IO / path safety / overwrite; Resource limits / large input; Error handling / rollback / partial outputs; Legacy compatibility
Evidence floor: new pytest cases in tests/test_skill_manager.py red before and green after; OCU unit command from AGENTS.md passes
```

Repository: `DankerMu/open-computer-use` (`../open-computer-use`); this fixture lives in the WebUI control plane as for every `[ocu]` issue.
