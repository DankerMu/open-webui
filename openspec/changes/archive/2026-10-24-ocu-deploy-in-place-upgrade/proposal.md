## Why

#626. The acceptance-host upgrade for #612 (2026-10-23, OCU `bff4f29` → `54be6fb`) needed three undocumented steps:

- `release.py import` refuses an existing install root, so the new release went to `/opt/ai-workbench-test/release-54be6fb`; `NETWORK-HARDENING.md:237` ("Deploy the new release with `deploy/up.sh` as usual") never says where.
- The release-derived keys in `$DEPLOY_ROOT/config/runtime.env` (the ten `recovery.IDENTITY_KEYS`, `deploy/recovery.py:55-66`) were rewritten by an ad-hoc script. The repo already has this rewrite as `recovery_resources.persist_selected_runtime_identity` (`deploy/recovery_resources.py:978-1017`), but it is reachable only from `activate_release`, which refuses a deployment that was not restored (`:1579`), and it pins `OCU_RELEASE_MANIFEST` to `<destination>/release.json` (`:972`, checked at `:1015-1016`). `bootstrap-test.sh:289-290` refuses an existing `runtime.env`; `release.py bootstrap` only prints values.
- `write-deployed-version.sh` hard-codes `source_dir="$deploy_root/source"` (`:12-13`, `:26`) before it reads the manifest (`:27`), so after the upgrade it failed with `source checkout HEAD is bff4f29…, expected 54be6fb…` and `DEPLOYED_VERSION.md` still names the old release.

Owner decision (2026-10-23): fix it.

## What Changes

In `open-computer-use`:

- (a) A `recovery.py` subcommand (`retarget`, run as root; #626 asked for a `release.py` subcommand, see design D1 for why it lives in `recovery.py`) that rewrites the ten identity keys of an existing `runtime.env` from a release root: `SOURCE_SHA`, `WEBUI_SOURCE_SHA` and the seven image variables from the release inventory, `OCU_RELEASE_MANIFEST` = `<release root>/release.json`. It verifies the release and the current file first (`load_inventory`, `verify_tracked_source`, `require_supported_source_contract` on `<release root>/source`; all ten keys present; no comment or blank line, since the rewrite re-renders the file), then writes a `0600` backup named `runtime.env.before-<new OCU commit, 12 hex>` (refusing if it exists, also when nothing changes), replaces the file atomically, re-reads and runs `verify_runtime_binding`, and prints only key names and release values. Every other line stays byte-identical. `persist_selected_runtime_identity` and the new subcommand share one implementation of the identity computation and write, in `recovery.py`; only the manifest path differs.
- (b) `write-deployed-version.sh` reads `OCU_RELEASE_MANIFEST` first (environment, else `runtime.env`; resolved to an absolute path) and uses `$(dirname manifest)/source` as the source checkout. The manifest and its source must share one install root, which holds for a fresh install (`NETWORK-HARDENING.md:9-11`), a plain import, and a recovery-activated root (whose `source` is a symlink created at `recovery_resources.py:1255-1257`); a manifest elsewhere fails with the expected path in the message.
- (c) `NETWORK-HARDENING.md` gains "Upgrading an existing deployment": build → transfer and checksum → `import` to a new root → the new subcommand → `up.sh` from the new root's `source` → `write-deployed-version.sh` → checks; the disk note (import stages a private copy and deletes it; keep the delivery of any release you may restore or activate, since restore and activate take it as `--retained-delivery`); rollback (restore the backup, run the old root's `up.sh`, then the newer root's `write-deployed-version.sh`; a root older than #612 also needs the manual proxy restart, `:206`). The #590 section's preamble (`NETWORK-HARDENING.md:225`, `cd "$DEPLOY_ROOT/source"`) changes to the selected release's source (`cd "$(dirname "$OCU_RELEASE_MANIFEST")/source"` after loading `runtime.env`), and its step 1 points to the new section.

Must preserve:

- `persist_selected_runtime_identity` behaviour and its tests (restore/activate);
- `write-deployed-version.sh` output and refusals for a fresh install (manifest at `$DEPLOY_ROOT/release.json`);
- no secret value printed or logged; `runtime.env` stays `0600` and owner-unchanged;
- `release.py import`, `bootstrap`, `verify`, `build` unchanged.

Out of scope: recovery restore/activate behaviour, retention of old release roots, automating build/transfer.

## Capabilities

### Modified Capabilities

- `ocu-offline-image-delivery`: new requirement "An existing deployment can be pointed at a newly imported release".

## Impact

An operator can upgrade a deployment without hand-editing a secret-bearing file, and the version record names the running release.

## Triage

```text
Issue type: bug + operator procedure (owner-approved)
Fixture level: expanded
Upstream suggested level: issue says M; expanded: secret-bearing runtime file rewrite, shared with recovery, operator doc
Blast radius: every deployment upgrade; a wrong rewrite starts the stack on mismatched images or leaks a secret
Selected risk packs: Security (secret handling, file mode/owner); File IO (atomic replace, backup, refusals); Config (identity keys, other keys untouched); Documentation (procedure, rollback)
Evidence floor: tests for the subcommand (happy path with path keys unchanged and other lines byte-identical; refusals for missing or mismatched release, missing identity key, comment or blank line, existing backup, symlinked runtime file, each leaving the file byte-identical with no backup or staging file left; a subprocess run of `python3 deploy/recovery.py retarget` refusing with a one-line error and no Traceback; no secret in output), recovery tests for persist unchanged, write-deployed-version from a separate release root and for a fresh install; tests/deploy in the CI-shaped container (non-root) plus the root-only cases; ./tests/test-project-structure.sh; acceptance host: the next real release upgrade follows the new section end to end
design.md: present
```
