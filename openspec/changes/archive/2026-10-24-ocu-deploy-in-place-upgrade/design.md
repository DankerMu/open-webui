## Context

The deployment keeps its data and configuration under `$DEPLOY_ROOT` and runs `up.sh` from a source checkout; `up.sh` locates its source from its own path (`deploy/up.sh:9`) and checks the stack against `OCU_RELEASE_MANIFEST`. Recovery already rewrites the identity keys when it activates a restored root (`recovery_resources.persist_selected_runtime_identity` `:978-1017`), using `recovery.parse_dotenv`/`render_dotenv`/`write_private_bytes` and `release.verify_runtime_binding`. `recovery.py` imports `release` (`:23`); `release.py` does not import `recovery`.

## Decisions

### D1. One implementation in `recovery.py`, two callers

A function in `recovery.py`, next to `IDENTITY_KEYS`, `parse_dotenv`, `render_dotenv` and `write_private_bytes`, takes `(inventory, manifest path)` and returns the ten identity values: `SOURCE_SHA` and `WEBUI_SOURCE_SHA` from the inventory, `OCU_RELEASE_MANIFEST` = the given path, and the seven image values from `release.derive_runtime_images(inventory)` (the current image values are replaced, never merged, so they do not affect the result). It never calls `bind_selected_runtime`, so `OCU_CHAT_DATA_DIR` and `OCU_SKILLS_CACHE_DIR` are never touched by an upgrade; `bind_selected_runtime` keeps serving its other callers (`recovery_resources.py:1029`, `:1339`). A second function writes a values mapping to the runtime file (stage privately, type and owner check, atomic replace, `0600`, re-read, `verify_runtime_binding`), shared too.

`persist_selected_runtime_identity` calls both with `<destination>/release.json` and keeps its behaviour, including adding a missing identity key and its manifest check (`:1015-1016`).

The subcommand lives in `recovery.py` (`python3 deploy/recovery.py retarget --runtime-file <path> --release-root <path>`), not `release.py`: run as a script, `release.py` is `__main__`, and a lazy `import recovery` would load a second `release` module whose `ReleaseError` the script's handlers do not catch, turning every refusal into a Traceback. Inside `recovery.py` the functions and their errors are the module's own. The subcommand needs no Docker daemon and takes no recovery lock. It refuses unless run as root (the config directory is root-owned `0700`; `recovery._ensure_private_dir` requires the owner to be the euid, `recovery.py:309-312`), like `bootstrap-test.sh:25` and `write-deployed-version.sh:7`.

### D2. Checks first, then backup, then replace

All checks run before anything is written: the runtime file is a regular, non-symlinked file owned by the euid; it parses; it has no comment or blank line (the write re-renders the file, so other lines stay byte-identical only without them; an operator who annotated it removes the annotations first, the error says so); all ten identity keys are present (the subcommand refuses a missing one; `persist` keeps adding it); the release verifies (`load_inventory`, `verify_tracked_source`, `require_supported_source_contract`); the new values pass `verify_runtime_binding` in memory.

Then the current file is copied to `runtime.env.before-<new OCU commit, 12 hex>` with `copy_private` (O_EXCL|O_NOFOLLOW, `recovery.py:315-320`, `:356-366`), refusing if the name exists; the backup is written even when every key is unchanged. If staging fails before `os.replace` (the original file is still in place), the backup and the staging file are removed, so a retry is not blocked and nothing is left. Whether the replacement happened is read from the file system (the runtime path's inode is the original until `os.replace` gives it the staged one), so a cancellation signal raised during or right after `os.replace` never removes the backup, and `SystemExit`/`KeyboardInterrupt` propagate unwrapped. Once the replacement has happened, a later failure (chmod, a re-read whose bytes differ from the rendered values, e.g. a short write, or the binding check) keeps the backup: it is then the only copy of the previous configuration, and the error names it. The 12-hex name never collides with the ad-hoc `runtime.env.before-54be6fb` already on the acceptance host.

### D3. Output

One line per identity key, `same` or `changed` with the new value (all ten are non-secret release identities), and the backup path. Errors are one line. No other key is printed.

### D4. Version writer

`write-deployed-version.sh` keeps its `runtime.env` readability check first, then resolves the manifest (`OCU_RELEASE_MANIFEST` from the environment, else from `runtime.env`) to an absolute path, then sets `source_dir=$(dirname "$manifest")/source` and runs the `.git` check. A missing source names the expected path. `DEPLOYED_VERSION.md` still lands in `$DEPLOY_ROOT`. Recovery-activated roots are unaffected: activation pins the manifest to `<root>/release.json` before the writer runs (`recovery_resources.py:972`, `:1564`, `:1641-1645`).

### D5. Procedure

"Upgrading an existing deployment": build → transfer and checksum → `release.py import` to `<parent>/release-<sha>` → `recovery.py retarget` from that root's source → `up.sh` from that root's source → `write-deployed-version.sh` → checks (`up.sh` stderr has `deploy: proxy restarted for …`, `docker ps`, probes). Layout stated: data and `config/` stay in `$DEPLOY_ROOT`; each release has its own root. Disk: import stages a private copy and deletes it when done; the delivery itself is kept for every release that may be restored or activated, because `recovery.py restore`/`activate` take it as `--retained-delivery` and the recovery set holds no image archives (`deploy/BACKUP-RESTORE.md:12-13`). Rollback: copy the backup named after the release you upgraded to (it holds the previous configuration) back over `runtime.env`, run the previous root's `up.sh`, then this change's `write-deployed-version.sh` (from the newer root, by absolute path: it reads the manifest from `runtime.env` and the `source` next to it, while a previous root older than this change carries the #626 writer); a root older than #612 also needs the manual proxy restart (`:206`); to upgrade to the same release again, move that backup aside first. Old roots are removed by hand. The #590 preamble `cd`s into the selected release's source.

## Risks / Trade-offs

- An annotated `runtime.env` is refused until the annotations are removed; the alternative (silently dropping them) loses operator notes.
- Old release roots accumulate.
- `recovery.py`'s existing `activate` has the same double-import pattern through `recovery_resources` (reported in review, out of scope).

## Evidence plan

- `retarget` tests (new module paired with `recovery.py`, or `tests/deploy/test_recovery.py`): happy path rewrites exactly the ten keys, path keys unchanged, every other line byte-identical, backup content equals the old file; unchanged rerun to the same release refuses on the existing backup; each refusal in D2 leaves the file byte-identical and no backup or `.identity-*` staging file; a failure injected before the replacement removes the backup and staging file; a failure injected after the replacement keeps the backup and names it; subprocess `python3 deploy/recovery.py retarget …` on a refusal prints one line, no `Traceback`; output contains no value of a `SECRET_MARKERS` key.
- Recovery tests covering `persist_selected_runtime_identity` pass unchanged.
- Version writer (`test_bootstrap_runtime.py`): fixture manifest moved to `deploy_root/release.json`; existing cases pass; `:788` asserts its reason; a new case with `OCU_RELEASE_MANIFEST` naming a separate release root whose `source` is at the manifest's commit while `$DEPLOY_ROOT/source` is at another records the release root's commit; a manifest without a sibling `source` fails naming the path.
- CI-shaped container run of `tests/deploy` as uid 1001 and the root-only cases as uid 0; `./tests/test-project-structure.sh`; `shellcheck` on the script.
- Acceptance host: task 3.1.
