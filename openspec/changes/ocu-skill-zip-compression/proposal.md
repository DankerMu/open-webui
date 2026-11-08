## Why

OCU's skill cache caps a registry ZIP at 200 MB unzipped, but both checks assume the decompressor honours the read size (DankerMu/open-webui#762). `_check_zip_entries` sums the declared `file_size`, which the archive author controls. The copy loop counts bytes only after `src.read(1 MB)` returns.

For `ZIP_DEFLATED`, CPython's `ZipExtFile` bounds each decompress call. For `ZIP_BZIP2` and `ZIP_LZMA` it decompresses a whole compressed block with no output bound. A reviewer measured, on the equivalent WebUI validator: a 1,834-byte BZIP2 ZIP with a 2 GiB zero entry reached about 4 GiB RSS before any count ran, and the LZMA case about 913 MiB (#761 review record, not re-measured here). One uploaded skill can therefore OOM `computer-use-server`. WebUI #761 already admits only stored and deflate on upload. OCU's registry URL is configurable, so OCU needs the same guard itself, as defence in depth.

## What Changes

- `_check_zip_entries` rejects, with `ValueError` and before any entry is opened, every entry whose `compress_type` is not `ZIP_STORED` or `ZIP_DEFLATED`. `ensure_skill_cached` then returns `None`, removes its temp directory, and keeps the old cache and manifest, as for every other rejection.

## Triage

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent (issue-scribe issue; agree: a file-format reader on a resource-limit path)
Blast radius: one registry ZIP can exhaust computer-use-server memory for every user's workspace
Selected risk packs: Resource limits / large input; File IO / path safety / overwrite (no write before rejection); Error handling / rollback / partial outputs; Legacy compatibility
Evidence floor: new cases in tests/test_skill_manager.py red on OCU main 2fea8f6 and green after; OCU unit command from AGENTS.md passes
```

Repository: `DankerMu/open-computer-use`. As for every `[ocu]` issue, this fixture lives in the WebUI control plane. Precedent: `ocu-skill-zip-safety` (#740, OCU PR #222).
