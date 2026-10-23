## Why

Backup cannot finish on any deployment where a sandbox has started once (#596). Each `chat-<id>-workspace` volume holds absolute links that the sandbox entrypoint creates on every start, for example `.claude/agents/code-reviewer.md -> /opt/skills-external/...` and links into `/mnt/skills/public/*` (OCU `Dockerfile:430-466`). The #591 rule refuses every absolute link, and every link that escapes the captured root. The 2026-10-22 rerun of #173 B-T14 failed this way on OCU `e016eb6`: `volume helper failed for chat-15a7376c-…-workspace: … unsafe symlink .claude/agents/code-reviewer.md`. No `recovery.json` was written, and the stack stayed stopped until `deploy/up.sh` was run. A venv the model creates (`bin/python3 -> /usr/bin/python3`) has the same effect.

Owner decision, option 2, recorded at issuecomment-6332874894:

- **Model-written trees** are the `chat-<id>-workspace` volumes and the host `chat_dir` tree. In them, absolute links and escaping links are captured verbatim and recreated on restore.
- **No restore step reads, writes, chmods or chowns through such a link,** on either the GNU tar path or the Python path.
- **Deployment-owned trees** are the WebUI data volume and `skills_dir`. They keep the strict #591 rule.

## What Changes

All changes are in OCU `deploy/` (`DankerMu/open-computer-use`), in one PR. Lines are on `origin/main` `e016eb6`.

- **Link policy.**
  - A `links` policy is passed through `recovery_fs`, with two values:
    - `confined`: today's rule, `_symlink_target_confined` (`recovery_fs.py:83-92`);
    - `verbatim`: any non-empty target without NUL.
  - The policy parameter is added to:
    - `capture_tree`, at `:299`;
    - `validate_archive`, at `:457`;
    - `inspect_archive`, at `:357`;
    - `extract_tree`, at `:502`;
    - `_python_capture`, at `:161`.
  - It is required, so a call site that omits it fails as a `TypeError`. Every call site is listed below and must pass it:
    - internal calls in `recovery_fs.py`: `capture_tree`→`validate_archive` (`:333`), `extract_tree`→`inspect_archive` (`:503`), `extract_tree`→`validate_archive` (`:511`);
    - `archive_has_regular_root_member` (`:527-532`), which calls `inspect_archive`. It is reached through `_archive_contains` (`recovery_resources.py:800-801`) from backup at `:712` and verify at `:849`, only for `webui-data`, so it uses `confined`;
    - `_copy_tree_archive` (`recovery_resources.py:679-681`), the host-side wrapper for `chat-data` and `skills-cache`, which takes the policy from its caller;
    - the direct test callers in `tests/deploy/test_recovery.py` (`:1090-1092`, `:1337-1339`, `:2506-2508`, `:2721`), plus the positional `capture_volume`/`restore_volume` calls in `_fail` (`:2711-2746`).
  - Both capture paths keep calling one predicate function, which now takes the policy.
- **Unchanged under both policies:**
  - a member below a link member is refused (`_reject_link_escapes` `:421-426`);
  - the hardlink rules are refused as today (`:385-388`, `:431-434`), so a hardlink can never be created through a link;
  - devices, duplicate names, destination conflicts, the empty-destination requirement and the Python on-disk parent check (`_require_safe_target` `:231-244`) all stay as they are.
- **Policy at the call sites** (`deploy/recovery_resources.py`):
  - `verbatim` for the workspace volumes: capture `:727-733`, restore `:1373`, verify `:877`;
  - `verbatim` for `chat-data`: capture `:715`, restore `:1325`, verify `:857`;
  - `confined` for `webui-data`: `:708`, `:1359`, `:854`;
  - `confined` for `skills-cache`: `:719`, `:1329`, `:860`.

  The manifest component decides the policy, and the archive records nothing about it.

- **Helper CLI** (`deploy/recovery_helper.py:30-61`). `capture` and `extract` take a required `--links=confined|verbatim` argument. `capture_volume` and `restore_volume` (`recovery_resources.py:645-676`) pass it through. The helper is mounted from the running checkout, so the CLI and the library always match.
- **Restore-time reader** (`_index_snapshot`, `recovery_resources.py:1456-1461`). It reads `chat_dir/<chat>/.ocu/index.json` after `chat-data` is restored, using `exists()` and `read_text()`, which follow links. `.ocu/` is server-owned and not model-writable: only `outputs/` is bind-mounted into the sandbox (`computer-use-server/docker_manager.py:1172-1173,1237`). But `verbatim` applies to the whole `chat-data` archive, so the archive rules no longer guarantee that `.ocu/` holds no link. The reader therefore opens the file without following any link in its path and fails loud on a link. This keeps the "no restore step reads through a link" guarantee on the host.
- **Docs.** `deploy/BACKUP-RESTORE.md:48-55` describes both policies and their trees. A set that holds absolute links must be verified and restored with tooling that includes this change.

## Capabilities

### Modified Capabilities

- `ocu-backup-rollback`: "Confined relative symlinks in captured trees" becomes a per-tree link policy, with verbatim links in model-written trees.

## Impact

- Backup succeeds on deployments with started sandboxes and with venvs.
- A restored workspace keeps its venv and entrypoint links with their original targets. The entrypoint links are recreated on the next start anyway.
- Older recovery tooling refuses a new set that holds absolute links, with `unsafe symlink`. The docs say so.
- Not changed:
  - the pre-quiesce scan. A capture refusal after quiesce still leaves the stack stopped: a link in a deployment-owned tree, a socket or FIFO in any tree (`recovery_fs.py:103-109`, `:286-287`), or a hardlink to a symlink (`:433-434`). A follow-up issue is filed (task 3.2), and this is not in scope;
  - cross-daemon restore (#173 B-T14 continues after this).

## Triage

```text
Issue type: bugfix (P0 for backups) with owner-decided policy
Fixture level: expanded
Upstream suggested level: M
Blast radius: every backup/verify/restore; recovery_fs predicate and both extract paths; helper CLI; restore-time host reader
Selected risk packs: File IO / path safety; Auth / privilege (root helper, host reads); Data integrity; Public API / CLI / script entry; Compatibility; Documentation
Evidence floor: recovery_fs unit tests per policy on GNU tar (Linux container) and Python paths; GNU tar root extract sentinel test proving nothing outside dest is read/written/chmod/chown'd; _index_snapshot link refusal test; fake-docker backup/verify/restore behaviour tests (e1)-(e4) plus argv check; real backup on the acceptance VPS publishes recovery.json and verify passes
```
