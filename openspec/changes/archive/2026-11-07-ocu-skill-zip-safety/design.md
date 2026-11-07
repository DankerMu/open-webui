## Design

Change surface: `computer-use-server/skill_manager.py` — `ensure_skill_cached` extraction loop and `_parse_api_skills`; new `tests/test_skill_manager.py`.

Must preserve:

- A valid ZIP with or without one shared top-level directory still extracts with `SKILL.md` at the cache root and files world-readable. The ZIP may include explicit directory entries and entries without Unix file-type bits (from `ZipFile.writestr` or Windows tools).
- The cache swap stays as `skill_manager.py:445-457` does it today:
  - With no existing `cache_dir`, the temp dir is renamed into place.
  - With an existing `cache_dir`, its contents are deleted and the new files moved in, so running sandboxes' bind mounts keep the same directory inode.
  - Either way the manifest SHA-256 is then updated.
- Every rejection happens before the delete-contents step, so a rejected archive never empties the old cache.
- A cache hit (same SHA-256, `SKILL.md` present) returns without downloading. A failed download still falls back to an existing stale cache.
- Registry entries with valid names are returned unchanged, and so are the default public skills that `_parse_api_skills` appends.
- `MAX_ZIP_SIZE` (download bytes) is unchanged.

Must add/change:

- **Per-entry rejection, on the raw `member.filename`, before the top-level-prefix stripping.** Today `:418-420` takes `../` or `/` as a "prefix" and strips it. An entry is rejected when:
  - its path is absolute;
  - any path component is `..`;
  - its name contains a backslash;
  - its Unix type bits (`external_attr >> 16`, `stat.S_IFMT`) are present and are neither a regular file nor a directory, which rejects symlinks. Entries with no type bits, and directory entries, are accepted;
  - after stripping, the resolved target falls outside `realpath(tmp_dir) + os.sep`.
- **Archive limits.** More than 2000 entries rejects the archive. So does a declared `file_size` sum above 200 MB, checked before any write. These limits match the WebUI upload validator (`ocu-uploaded-skills` spec, ZIP validation). Bytes are also counted as they are read, streamed in chunks, against the same 200 MB cap. That counter is defence in depth only: `zipfile` stops at the declared size, and a CRC mismatch already raises `BadZipFile`. No test can make it fire on `main`, so no red test is required for it.
- **Name validation in `_parse_api_skills`.** A registry entry is dropped, with a log line, unless its name passes `re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._-]*', name)` and contains no `..`. A full match is required: with `re.match` and `$`, `"ok\n"` would pass.

Governing invariant: nothing derived from registry input can make OCU write, keep or mount a path outside `SKILLS_CACHE_DIR/<valid name>`. Registry input here means ZIP entry names, ZIP sizes and skill names.

Sibling surfaces:

- **Path joins on the skill name**, all reached only through `_parse_api_skills` output, so its filter covers them:
  - `SKILLS_CACHE_DIR / skill.name` (`:386`);
  - `tempfile.mkdtemp(prefix=f".{skill.name}-")` (`:413`);
  - the host and container paths in `get_skill_mounts` (`:705-712`);
  - the `SkillInfo.location` prompt string.
- **How skills reach those joins.**
  - `get_user_skills` and `get_user_skills_sync` (`:587-604`; this one is how containers get mounts at creation, `docker_manager.py:1311-1313`) both build their lists through `_parse_api_skills`, including the `_memory_cache` and `_user_configs` disk-JSON paths.
  - The other `SkillInfo` constructors, `_build_default_skills` and `video_skills`, use constants only.
- **Registry-controlled `skill_path`.** It only reaches the prompt `location` string (`:64-65`), never a filesystem join. Out of scope.
- **Callers.** `app.py` `/skill-mounts` and `system_prompt.py` (cache), and `docker_manager.py` (mounts), are unchanged. They receive fewer skills when names are invalid.

Seams under test:

- `ensure_skill_cached(SkillInfo)`, with `_download_skill_zip` mocked to return constructed ZIP bytes, and `SKILLS_CACHE_DIR` and the manifest pointed at a pytest temp directory.
- `_parse_api_skills` / `get_user_skills` with a mocked registry response.
- `get_skill_mounts` on the parsed list.

Required evidence. Every absolute or escaping path in a test resolves under the test's temp root, never a real system path.

- **Rejection cases.** Each fails on `main` @ 499e048 and passes after the fix. Each returns `None`, writes no file outside the cache root, leaves no temp dir, and leaves a prior `invoice` cache dir (contents) and the manifest byte-identical:
  - (a) `SKILL.md` + `../../REL_ESCAPE`;
  - (b) `SKILL.md` + an absolute entry `<tmp_root>/ABS_ESCAPE`;
  - (c) a ZIP whose every entry starts with `../` (`../SKILL.md`, `../x`);
  - (d) a ZIP whose every entry starts with `/<tmp_root>/` (`/…/SKILL.md`, `/…/x`);
  - (h) `SKILL.md` + `..\..\BS_ESCAPE` (backslash; on `main` it lands as a literal filename and succeeds);
  - (e) `SKILL.md` + a symlink entry (`external_attr = (stat.S_IFLNK | 0o777) << 16`);
  - (i) `x/SKILL.md` + `x//<tmp_root>/DS_ESCAPE` (passes the raw checks; only the post-strip realpath guard stops it; escapes on `main`);
  - (f) 2001 entries;
  - (g) entries of zeros, deflated, whose declared size totals more than 200 MB.
- **Name cases.** Each fails on `main` and passes after. Registry names `../outside-rel`, `a/b`, `/abs`, `..`, `"ok\n"` and `a..b` (passes the regex, dropped only by the `..` check) are absent from `get_user_skills`, and `get_skill_mounts` produces no mount for them.
- **Regression cases.** Each passes on `main` and after:
  - a flat valid ZIP;
  - a valid ZIP wrapped in one top-level directory, with explicit directory entries;
  - a valid ZIP made with `writestr` (no type bits).
    Each lands with `SKILL.md` at the cache root and the manifest updated. A replacement of an existing cache keeps the cache directory's inode.

Non-goals: WebUI upload validation (#744); the `settings-wrapper` mock; the `MAX_ZIP_SIZE` value; native public skills; `skill_path` validation.

Review focus:

- Checks run on the raw names, before prefix stripping.
- No rejection path reaches the delete-contents or rename step.
- Temp-dir cleanup on every rejection path.
- Type-bit handling accepts Windows and `writestr` ZIPs.
- The stale-cache fallback cannot serve files from a rejected archive.
