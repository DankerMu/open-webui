## Governing invariant

A terminal start answers exactly as it does on OCU `origin/main` `89327b6`, with the same execs in the same order, and the only new effect is that `/home/assistant/files` becomes a symlink to `/mnt/user-data/files` when nothing existed at that path. Nothing that already exists at that path, or inside the chat's files directory, changes.

## The snippet

```text
TERMINAL_FILES_LINK = "ln -sT /mnt/user-data/files /home/assistant/files >/dev/null 2>&1; "
```

- **No guard test.** `ln -sT` without `-f` makes one `symlinkat` call. It fails with EEXIST for any existing entry, a dangling symlink included, so there is no check-then-create race.
  - `-T` matters: without it, a directory or a symlink to a directory at the path would make `ln` create `files/files` inside the target, which for a link to `/mnt/user-data/files` is the chat's own files directory.
  - The non-gateway start holds no chat lock, so two starts can run the snippet at once. One creates the link and the other fails silently.
- **Silent.** `_execute_bash` returns stderr inside `output` (`docker_manager.py`, around 1388-1420). `_start_gateway_terminal` compares `output.strip() == "MATCH"`, and the non-gateway path looks for `RUNNING`. Any `ln` message would turn every reuse into a restart. Both streams therefore go to `/dev/null`.
- **Placement.** It prefixes `_terminal_reuse_probe(fingerprint)`, the first exec of a gateway start, and the non-gateway `pgrep` check in `start_ttyd`. It does not prefix `_terminal_ready_probe`, `_ttyd_start_command` or `TERMINAL_STOP_COMMAND`.

## Who owns the link

- `_execute_bash` passes no `user=`, so the exec runs as the container user. In the production image that is `assistant:assistant` (`docker_manager.py:1216`), which owns `/home/assistant`, so the link is owned by `assistant`.
- In the development image (`docker_manager.py:1219`), the workspace volume is mounted at `/root` and `/home/assistant` may not exist. `ln` then fails silently and the start is unchanged. This is the intended no-op, not a breach of the requirement, which applies to sandboxes whose home is `/home/assistant`.

## Downstream consumers of `/home/assistant`

- **Nothing in OCU follows links under `/home/assistant`.** Only `.claude` subpaths are walked: the Dockerfile's `chown -R --no-dereference`, `app.py:1315` (session list) and `mcp_tools.py` (plan and session files).
- **Backups.** The workspace scanner uses `lstat` and keeps absolute targets under the `verbatim` link policy (`deploy/recovery_resources.py:35`, `deploy/recovery_fs.py:104-108, 413-427`). Restore recreates the link with `os.symlink` (`recovery_fs.py:295`). The backup's sandbox mount check, `_sandbox_attributed` (`deploy/recovery_resources.py:366`), expects exactly the workspace and files mounts, and this change adds none.
- **Outputs broker.** It skips symlinks when scanning and refuses them on read (`outputs_broker.py:559, 633`). The link lives outside the files directory, so the sidebar is unaffected.

## Test harness

`FakeSandbox._bash` (`tests/orchestrator/test_terminal_gateway.py:181-195`) runs the probe and `pgrep` scripts in real host bash. It already rewrites `/proc/` and the listener test. It must also rewrite `/home/assistant/` and `/mnt/user-data/files` to directories under `tmp_path`, so no test writes on the developer's or CI host. The branch selection in `exec_run` (`startswith("SECONDS=0; until")`, `"pgrep" in script`) must keep working with the prefix.

OCU tests also run on macOS, whose `/bin/ln` has no `-T`. The harness therefore adds a stub `ln` to `self._bin`, which `PATH` already puts first: it makes one `os.symlink(target, link)` call, which fails on any existing entry and writes the error to stderr, so the silence assertion still means something. Evidence b proves where the snippet sits, that the link is created only when absent, and that probe output stays exact. GNU `ln -sT` itself is proved only by evidence c, in the Ubuntu 24.04 sandbox image (OCU `Dockerfile:6`).

## Evidence

- **a. Same execs, same answers.** For a gateway fresh start, a gateway reuse and a non-gateway start, the exec sequence and the answer equal those on `origin/main`, and the first exec begins with `TERMINAL_FILES_LINK`.
- **b. Files in, files out** (unit tests, through the harness rewrite and the stub `ln`):
  - absent path → after the start, `readlink` of the rewritten `files` is the rewritten files directory;
  - an existing directory, regular file, symlink to elsewhere, symlink to a directory and dangling symlink → `lstat` and `readlink` unchanged, nothing created inside a directory, and a reuse still answers `already_running: true`.
- **c. Real bash in the sandbox image** as `assistant`, with a bind mount at `/mnt/user-data/files`:
  - absent → link to `/mnt/user-data/files`;
  - the five existing kinds → unchanged, nothing created inside a directory or under `/mnt/user-data/files`;
  - the bare `ln -sT` against an existing directory and a symlink to a directory fails;
  - `/home/assistant` read-only, and `/home/assistant` absent → the gateway reuse probe prints exactly `MATCH`, `OTHER` or `NONE`, and the non-gateway check prints exactly `RUNNING` or `STOPPED`.
- **d. Green:** OCU unit command for `test_terminal_gateway.py` and `test_subagent_gateway.py`; docs-lint gates; `./tests/test-project-structure.sh`.
