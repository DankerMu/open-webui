## Design

Change surface: `computer-use-server/skill_manager.py` `_check_zip_entries` (`:381-394` at OCU `main` `2fea8f6`) and `tests/test_skill_manager.py`.

Must preserve:

- Valid stored and deflate ZIPs still cache exactly as today. That covers flat, wrapped, `writestr`, fresh cache and in-place replacement keeping the inode, through the existing `VALID` cases.
- Every existing rejection keeps its behaviour and its test.
- A cache hit and the stale-cache fallback are unchanged.
- `MAX_ZIP_SIZE`, `MAX_ZIP_ENTRIES` and `MAX_UNZIPPED_SIZE` are unchanged.

Must add/change:

- In `_check_zip_entries`, inside the existing per-entry loop, `info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)` raises `ValueError(f"entry {name!r} uses compression method {method}; only stored and deflate")`, where `method` is `zipfile.compressor_names.get(...)` or the number.
- The allowed set is one module-level tuple. It matches the WebUI upload validator's `_METHODS` (`backend/open_webui/utils/ocu_skill_zip.py:26`) and OCU's own OOXML inspector `_ALLOWED_COMPRESSION` (`computer-use-server/office/ooxml.py:18`, enforced at `:61`).
- It is not imported from `office.ooxml`. That constant is private to the Office broker package: importing it would load `office/ooxml.py`, which imports `outputs_broker`, into `skill_manager`, coupling the skill cache to the Office broker for two `zipfile` constants.
- The method is read from the central directory: `ZipFile.open` builds the decompressor from `zinfo.compress_type` and never reads the local header's method field. Checking `infolist()` therefore covers exactly what gets decompressed. An allowlist, not a bzip2/lzma blocklist, also covers methods that later Python versions add to the same unbounded branch (for example `ZIP_ZSTANDARD = 93` in 3.14).

Governing invariant: no byte of a registry ZIP is decompressed unless its entry uses a method whose `ZipExtFile` read is output-bounded. Today that means stored or deflate.

Sibling surfaces:

- `ensure_skill_cached` is the only ZIP extraction in OCU. The other `zipfile` reader, `office/ooxml.py`, streams OOXML parts without extracting them and already enforces the same allowlist; it is unchanged. Checked with `grep -rn zipfile computer-use-server/`; the PR states the result.
- The copy loop's byte counter (`:463-468`) stays as a backstop. It is correct for the allowed methods.
- WebUI #761 is the first gate, for uploads. This is the second, for whatever the configured registry serves.

Seams under test: `ensure_skill_cached(SkillInfo)` with `_download_skill_zip` mocked, as in the existing `sm`, `serve_zip`, `prior_cache`, `snapshot` and `cache` helpers. Also `_check_zip_entries` directly, for the method table.

Required evidence: see tasks.md 1.1. Every case uses small entries; no test builds a large bomb.

Non-goals:

- the WebUI validator (#761);
- encrypted-entry handling (zipfile already raises on encrypted reads without a password);
- re-implementing a bounded decompressor;
- any limit value change.

Review focus:

- The check runs before any `zf.open`.
- The rejection goes through the existing cleanup path.
- Stored and deflate stay accepted.
