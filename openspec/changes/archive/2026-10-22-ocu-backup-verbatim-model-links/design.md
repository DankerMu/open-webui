## Context

The context is the explorer map of OCU `origin/main` `e016eb6`, which the proposal cites. Key facts:

- **GNU tar.** Capture with `CAPTURE_FLAGS` (`recovery_fs.py:24-33`) stores links as links, because it has no `-h`. Extract with `EXTRACT_FLAGS` (`:34-41`) uses no `--overwrite` and no `-h`, and runs as root inside the helper (`recovery_resources.py:624-625`). The only barrier on this path is `inspect_archive`, which runs before tar.
- **Python extract.** `_require_safe_target` checks every on-disk parent with `lstat`. `_apply_metadata` uses `setxattr(follow_symlinks=False)`, `lchown` and `utime(follow_symlinks=False)`, and runs `chmod` only for non-symlinks (`:206-228`).
- **Post-extract walks.** `_walk_tree` and `_destination_empty` use `lstat`. The broker listing used during restore uses `follow_symlinks=False` and `O_NOFOLLOW`.
- **The one following reader** of a restored model-written path is `_index_snapshot` (`recovery_resources.py:1456-1461`).

## Decisions

### D1. One predicate with an explicit policy

```python
def _symlink_target_allowed(member_name: str, target: str, links: str) -> bool:
    if links == "verbatim":
        return bool(target) and "\0" not in target
    if links == "confined":
        return _symlink_target_confined(member_name, target)
    raise ValueError(f"unknown link policy: {links}")
```

- **Callers.** `_python_capture` and `inspect_archive` both call this function, so GNU tar and Python keep a single predicate, as the issue's acceptance criterion requires.
- **Required policy.** The policy is a required keyword on every public function: `capture_tree(root, archive, *, links)`, `validate_archive(archive, *, links)`, `inspect_archive(archive, *, links)` and `extract_tree(archive, dest, *, links)`. There is no default. A default of `confined` would silently keep backups failing at any call site that was missed, and a default of `verbatim` would silently weaken a deployment-owned tree.
- **Rejected alternative:** a separate allowlist of entrypoint paths (the narrower option 3 variant). The owner did not choose it, and it misses venvs.

### D2. Rules that stay under `verbatim`

The policy relaxes only the symlink target check. These rules stay for both policies:

- a member whose name-ancestor is a link member is refused;
- a hardlink must have a relative target without `..`, must point at an existing non-symlink member, and must not sit below a link;
- devices, duplicate names, destination conflicts and the empty-destination rule are unchanged;
- the Python on-disk parent check is unchanged.

Together, these mean extraction never creates a path below a link, never creates a hardlink through one, and never applies metadata to a link's target.

### D3. GNU tar extract proof, not a new flag

The flags stay as they are unless evidence (b) fails. Within one archive, each name appears once, and no member sits below a link member. The destination is a real, empty directory (`:485-499`), and the root member `.` must be a directory (`:439-441`), so `_apply_archive_root_metadata` only touches `dest`. GNU tar also creates a symlink whose target is absolute or contains `..` as a placeholder file first, and makes the real link only at the end of extraction. So GNU tar never opens a path through a link that this archive created. The GNU path's safety rests on this behaviour, and evidence (b) shows it in practice.

Evidence (b) proves this on real GNU tar as root, in a Linux container: the sentinel files outside `dest` keep their content, mode, owner and mtime, and no new file appears at any link target.

If (b) shows tar touching a link target, for example through delayed directory metadata, the fix is a flag change. That flag is then named in the PR with the failing evidence. The fix does not drop GNU tar.

### D4. Helper CLI carries the policy

```
recovery_helper.py capture --links=<p> source archive
recovery_helper.py extract --links=<p> archive target
```

`argparse` uses `choices` and requires the argument. `capture_volume(volume, …, links)` and `restore_volume(…, links)` take it from their callers. The host-side re-validation in `capture_volume` (`:660`) and in `restore_volume` (`:666`) uses the same policy.

### D5. Component-to-policy map in one place

`recovery_resources.py` defines one mapping, used by backup, verify and restore:

```python
LINK_POLICY = {"webui-data": "confined", "skills-cache": "confined", "chat-data": "verbatim", "workspaces": "verbatim"}
```

A component that is missing from the map raises `KeyError`, and that failure is loud.

### D6. `_index_snapshot` never follows

The reason is that `verbatim` covers the whole `chat-data` archive, so the archive rules no longer exclude links under `.ocu/`; `.ocu/` itself is not model-writable. The function opens `chat_dir/<chat>/.ocu/index.json` component by component, with `O_NOFOLLOW` and `O_DIRECTORY` on each parent and `O_NOFOLLOW` on the file.

- An entry that is missing at any level gives today's "missing" result.
- A link at any level raises `RecoveryError("… index path is a symlink")`.

The `O_NOFOLLOW` open pattern in `_office_blockers` (`:42-87`) is extracted into one shared helper that both callers use, rather than copied.

## Must preserve

- The deployment-owned trees and all existing #591 behaviour under `confined`. The current tests stay as they are and are called with `links="confined"`:
  - `test_hf_cache_links_round_trip_*`;
  - `_assert_confined_links_round_trip`;
  - `_assert_escaping_capture_refused`;
  - `test_escaping_link_archives_refuse_before_mutation`;
  - the case-alias and on-disk parent tests;
  - `test_symlink_ancestor_and_device_members_fail_closed`.
- Helper failure reporting (#591), and archive format and manifest compatibility for sets with no absolute links.
- `verify_recovery_set` still validates every archive.

## Non-goals

- A pre-quiesce scan. A capture refusal after quiesce still leaves the stack stopped. This covers links in deployment-owned trees, sockets and FIFOs in any tree, and hardlinks to symlinks. The follow-up is task 3.2.
- Changing the link rule for deployment-owned trees.
- Cross-daemon restore.

## Required evidence

**Where tests run.** Hosted OCU CI (`build.yml:236-254`) runs `python -m unittest discover -s tests/deploy` on `ubuntu-latest` with setup-python, not in a container and not as root, and the unit job is currently disabled. The evidence is therefore:

- the unittest suite in the CI-shaped container (`python:3.13`, uid 1001, with GNU tar);
- a separate local root step for (b) GNU.

The root step's exact command and output go in the PR, together with `tar --version` from both `python:3.13` and the workspace image (`ubuntu:24.04`, `Dockerfile:6`).

- **(a) Round trip under `verbatim`, for both GNU and Python.**
  - The tree contains:
    - `bin/python3 -> /usr/bin/python3`;
    - `.claude/agents/x.md -> /opt/skills-external/a/x.md`;
    - `.claude/skills/s -> /mnt/skills/public/s/`, a directory target with a trailing slash, the entrypoint `ln -sf "$skill"` shape;
    - `a/x -> ../../outside`;
    - `x -> ..`.
  - Capture, `validate_archive` and extract all succeed.
  - Each restored link has its original target (`os.readlink`).
  - Red on `main`: calling without the policy argument fails with `unsafe symlink` on the absolute link.
- **(b) Nothing is touched through links, on GNU tar and on Python.**
  - **Positive control first.** Pre-create `dest/l -> <sentinel_dir>` to bypass `_destination_empty`. Extract an archive holding `l/evil` with the same `_run_tar([*EXTRACT_FLAGS, …])`. `sentinel_dir/evil` must appear, which proves the harness detects a write through a link.
  - **Real case.** Use an empty `dest` and a `verbatim` archive. Sentinels at the link targets are:
    - an absolute file;
    - an absolute directory with entries, for the trailing-slash link;
    - the path that `../../outside` resolves to.
  - Record the bytes, mode, uid/gid and mtime_ns of each sentinel, and for the directory sentinel its entry list and mtime. After the extract, all of these are unchanged.
  - **GNU path.** The test asserts that `_gnu_tar()` is true. With `OCU_TEST_EXPECT_ROOT=1` set, it fails if it is not running as root, instead of skipping.
  - **Python path.** Spies on `os.lchown`, `os.utime`, `os.setxattr`, `os.chmod` and `open` show that `lchown` touches only the link itself, and that no other call lands on a link or its target.
- **(c) The structural rules still refuse under `verbatim`.** Each of these is refused and `dest` stays empty:
  - a member below an absolute link member (`l -> /tmp` plus `l/evil`);
  - a hardlink to a symlink member;
  - a hardlink whose target is `/abs` or contains `..`;
  - a device.
- **(d) `confined` is unchanged.** The existing #591 tests pass, with the policy passed explicitly.
- **(e) Policy plumbing, by behaviour.** Run fake-docker backup, verify and restore (`tests/deploy/fakebin/docker` runs the real helper, `:1721`):
  - (e1) with an absolute link in `chat_dir/<chat>/outputs` and in a workspace volume, backup publishes `recovery.json`;
  - (e2) with an absolute link in `skills_dir`, backup fails with `unsafe symlink`;
  - (e3) a recovery set whose `skills-cache` or `webui-data` archive holds an absolute link fails verify;
  - (e4) after restore, the `chat-data` and workspace links keep their targets.

  Also check the argv: `--links=verbatim` for workspace helpers and `--links=confined` for the WebUI volume. A missing policy raises `TypeError`, and an unknown policy raises `ValueError`.

  Red on `main`: (e1) fails with `unsafe symlink`, and the argv has no `--links`.

- **(f) `_index_snapshot`.**
  - A link at `.ocu`, or at `.ocu/index.json`, raises `RecoveryError`, and the link target is never opened; the test points the link at a file whose opening it can detect.
  - A missing file gives the missing result, and a regular file reads as before.
- **(g) Real backup on the acceptance VPS**, the #173 host, never the LAN instance. Run from a checkout of the merged SHA.
  - `deploy/recovery.py backup` publishes `recovery.json` on the deployment whose workspace volumes hold the 47 absolute links.
  - `verify` passes.
  - Restart the stack with `deploy/up.sh` and record its health.
  - Do not print values from runtime.env or dmxapi.env, or the admin credentials.
