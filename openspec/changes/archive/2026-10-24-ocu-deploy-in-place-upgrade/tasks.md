## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-deploy-in-place-upgrade --strict --no-interactive`.

## 2. Implement (in open-computer-use)

- [x] 2.1 Tests first (design evidence plan), red on `ec5698c` (OCU `main` after #617; the files this change touches are unchanged since `54be6fb`) where behaviour is new. Move the version-writer fixture manifest to `deploy_root/release.json` (`tests/deploy/test_bootstrap_runtime.py:172-177`), the real layout, and make `test_replaced_image_preserves_existing_version_record` (`:788`) assert its specific failure reason.
- [x] 2.2 Shared identity computation and write in `recovery.py` (D1, D2); `persist_selected_runtime_identity` uses it and keeps its behaviour.
- [x] 2.3 `recovery.py retarget` subcommand (D1–D3) and its `--help`.
- [x] 2.4 `write-deployed-version.sh` (D4).
- [x] 2.5 `NETWORK-HARDENING.md` "Upgrading an existing deployment" (D5); the #590 preamble `cd` and step 1 pointer; a BACKUP-RESTORE cross-link if it lists release commands.
- [x] 2.6 Green: the touched test modules on macOS, then `tests/deploy` in the CI-shaped container as uid 1001 and the root-only cases as uid 0; `./tests/test-project-structure.sh`; `shellcheck` on the changed script.

## 3. Verify

- [x] 3.1 Acceptance host: the next real release upgrade (planned after #617 merges) follows the new section end to end with the release's own `recovery.py retarget` and `write-deployed-version.sh`; record outputs on the issue without secrets. #626 stays open until then.

## Risk packs

Selected:

- **Security:** no secret in output, file mode and owner kept, 2.2, 2.3.
- **File IO:** atomic replace, backup-exists refusal, symlink/foreign-owner refusal, 2.2.
- **Config:** exactly the ten keys change, other values byte-identical, 2.1.
- **Documentation:** procedure and rollback, 2.5.

Not selected:

- **Concurrency:** single operator command; recovery holds its own lock and calls the shared function inside it.
- **Public API:** `recovery.py` gains a subcommand; no existing command changes.
