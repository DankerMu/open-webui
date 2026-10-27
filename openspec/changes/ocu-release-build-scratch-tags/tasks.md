## Risk packs

- Selected: Release / packaging (scratch tags in the release build); Error handling / rollback (cleanup on failure and on cleanup failure → evidence b, e); Concurrency / shared state (two builds against one engine, possibly with the same pid in fresh `docker:…-cli` containers → evidence c, d).
- Not selected: Auth / permissions / secrets (no auth surface); Public API (no interface change); Schema (release.json and the inventory are unchanged); File IO (archive bytes and paths are unchanged); Legacy compatibility (scratch names are never persisted or consumed).

## 1. Fixture

- [x] 1.1 Proposal, tasks and spec delta; fixture review; `openspec validate ocu-release-build-scratch-tags --strict --no-interactive`.

## 2. Implement (OCU, branch `claude/plan2-build-scratch-tags`)

- [x] 2.1 Tests first in `tests/deploy/test_offline_release.py`, red on `main` where marked:
  - a. (red) After a successful `build_release`, no `ocu-build-*` key remains in the fake engine's `images.json`, while the content references and pulled upstream references remain.
  - b. (red) A build that fails after workspace's image was built: one `save-script.json` action with a wrong `ConfigBytes` (as in the alias test at `test_offline_release.py:783-786`) corrupts the first save, workspace's initial export. Expected: non-zero exit, stderr contains "engine image identity is not verified by the archive", no `ocu-build-workspace-*` key in `images.json`, and the destination is absent. A second case uses `build-script.json` so the build fails before tagging: the original error is reported and `ops.log` has no `image rm`.
  - c. (red) A stale `ocu-build-{role}-{pid}` tag (old format) is seeded from inside the build's own process, using the inline-program pattern of `export_plan` (`:672-693`) or `patched_release`/`build_with` (`:317`, `:342`). Expected: the build succeeds and the stale key is still in `images.json` with the same record.
  - d. Two helper calls for the same role in one process return different names. With the helper patched to return a seeded, occupied name, the build aborts before building with "conflicts with the release", the seeded record in `images.json` is unchanged, and no `image rm` was issued for it.
  - e. Cleanup failure, using the existing `image-rm-fail` knob. On an otherwise successful build: non-zero exit, with a message naming the scratch reference. Combined with the b knob: the original error is reported, and stderr also carries a "may remain" warning.
- [x] 2.2 Helper for scratch names, used at both call sites; scratch-tag retirement for built roles, as in the proposal; update the occupied-alias seeding at `test_offline_release.py:683` to take the name from the helper.
- [x] 2.3 Green: `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/deploy/test_offline_release.py -q --import-mode=importlib`, then the full AGENTS.md unit command (the two files binding `127.0.0.1:8082` may run in a Linux container if the port is held locally); `./tests/test-project-structure.sh`. Only `tests/deploy/` imports `deploy/release.py`. It ran in full: the only failures were the 43 tests in the two files that bind `127.0.0.1:8082`, which a local tunnel held; neither file imports `release.py`.

## 3. After merge (orchestrator)

- [ ] 3.1 The next real release build on the workstation leaves no `ocu-build-*` tag: `docker images --format '{{.Repository}}' | grep -c '^ocu-build-'` prints `0`. Read the printed count; `grep -c` exits 1 when nothing matches.
