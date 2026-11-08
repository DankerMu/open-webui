## 1. Compression-method guard

- [ ] 1.1 Write the tests in `tests/test_skill_manager.py`, reusing `zip_of`-style builders and the `sm`, `serve_zip`, `prior_cache`, `snapshot` and `cache` helpers. Every case uses entries of at most a few KB.
      Task 1.1 required evidence (issue #762; each item is input → expected output):
  - **Rejected, red on OCU `main` `2fea8f6` and green after.** Each case returns `None` from `ensure_skill_cached`. The `snapshot(tmp_path)` of the whole temp root (prior `invoice` cache, manifest, no leftover `.invoice-*` temp dir) equals the snapshot before.
    - `bzip2-entry`: `SKILL.md` (deflate) plus `payload.bin` written with `compress_type=zipfile.ZIP_BZIP2`.
    - `lzma-entry`: the same with `zipfile.ZIP_LZMA`.
    - `bzip2-skill-md`: `SKILL.md` itself `ZIP_BZIP2` and nothing else.
  - **Before any read.** For the `bzip2-entry` and `lzma-entry` ZIPs, a recording wrapper on `zipfile.ZipFile.open` sees no call. This uses the technique of `test_declared_size_rejects_before_any_entry_is_read`. Red on `main`.
  - **Method table on `_check_zip_entries`.**
    - A `ZipInfo` list with one `ZIP_BZIP2` entry raises `ValueError`, with `bzip2` in the message.
    - `ZIP_LZMA` raises with `lzma`.
    - An unnamed method number such as `99` raises with `99`.
    - `ZIP_STORED` and `ZIP_DEFLATED` infos raise nothing.
    - The rejecting cases are red on `main`; the accepting ones pass on both.
  - **Accepted (controls; green before and after).**
    - A flat ZIP written entirely with `ZIP_STORED` caches with `SKILL.md` at the cache root and the manifest updated.
    - All existing `VALID` cases, all deflate, still pass.
  - **Must preserve.** Every existing case in `tests/test_skill_manager.py` passes unchanged, and so do the other test files that reference `skill_manager`. The module docstring of `tests/test_skill_manager.py` (which says one test wraps `zipfile.ZipFile.open`) is updated to match.
- [ ] 1.2 In `_check_zip_entries`, reject every entry whose `compress_type` is not `ZIP_STORED` or `ZIP_DEFLATED`. Use one module-level tuple and raise `ValueError` inside the existing per-entry loop. Change nothing else.
- [ ] 1.3 Run the OCU unit command from OCU `AGENTS.md`. The PR states passed and skipped counts before and after, `uvx ruff@0.17.2 check` adds no finding on the changed files over `main` (OCU has no ruff config, so this is a before/after comparison with default rules), and the PR states the `grep -rn zipfile computer-use-server/` result.
- [ ] 1.4 Docs: `CHANGELOG.md` gains an Unreleased `main` / Fixed entry. The PR changes only `computer-use-server/skill_manager.py`, `tests/test_skill_manager.py` and `CHANGELOG.md`.

Risk packs:

- Resource limits / large input — selected: unbounded decompression for bzip2 and lzma; tests 1.1 rejected cases and the before-any-read recorder.
- File IO / path safety / overwrite — selected: rejection before any write; the whole-root snapshot in 1.1.
- Error handling / rollback / partial outputs — selected: the existing cleanup path; the 1.1 snapshot covers the temp dir, the old cache and the manifest.
- Legacy compatibility — selected: stored and deflate ZIPs; 1.1 accepted cases and the existing `VALID` cases.
- Public API / CLI, Config, Schema, Auth/secrets, Concurrency, Release, Documentation beyond the changelog — not selected: no interface, config, schema, credential, ordering or packaging change.
