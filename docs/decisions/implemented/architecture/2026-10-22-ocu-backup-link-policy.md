---
id: 2026-10-22-ocu-backup-link-policy
title: Backups capture links in model-written trees verbatim and never follow them on restore
kind: architecture
status: implemented
date: 2026-10-22
supersedes: none
references: DankerMu/open-webui#596, DankerMu/open-computer-use#163, ocu-backup-verbatim-model-links
---

# Backups capture links in model-written trees verbatim and never follow them on restore

## Problem

Backup could not finish on any deployment where a sandbox had started once. The
sandbox entrypoint creates absolute links in every `chat-<id>-workspace` volume
on each start, for example `.claude/agents/code-reviewer.md -> /opt/skills-external/...`
and links into `/mnt/skills/public/*` (OCU `Dockerfile:430-466`). A venv the
model creates (`bin/python3 -> /usr/bin/python3`) has the same shape. The #591
archive rule refused every absolute link and every link that escapes the
captured root. The 2026-10-22 rerun of #173 B-T14 on OCU `e016eb6` failed with
`volume helper failed for chat-15a7376c-…-workspace: … unsafe symlink
.claude/agents/code-reviewer.md`. No `recovery.json` was written, and the stack
stayed stopped until `deploy/up.sh` ran again.

The links are not safe to follow: the recovery helper extracts as root, and a
link target outside the captured root names a host or container path that the
backup does not own.

## Decision

Owner decision, option 2, recorded on DankerMu/open-webui#596
(issuecomment-6332874894): capture verbatim, never follow.

**One predicate with an explicit policy.** `deploy/recovery_fs.py` has one
symlink predicate that takes a `links` policy, and both capture paths (GNU tar
and the Python fallback) call it:

- `confined`: the #591 rule. A relative target that resolves inside the
  captured root is kept; absolute and escaping targets are refused.
- `verbatim`: any non-empty target without NUL is stored unchanged and
  recreated on restore.

The policy is a required keyword on `capture_tree`, `validate_archive`,
`inspect_archive` and `extract_tree`, and a required `--links` argument on the
helper's `capture` and `extract` commands. There is no default: `confined`
would silently keep backups failing at a missed call site, and `verbatim` would
silently weaken a deployment-owned tree. An unknown value raises `ValueError`.

**Per-tree map.** One mapping in `deploy/recovery_resources.py` is used by
backup, verify and restore. A component missing from the map raises `KeyError`.

| Component      | Tree                                  | Owner      | Policy     |
| -------------- | ------------------------------------- | ---------- | ---------- |
| `workspaces`   | `chat-<id>-workspace` volumes         | model      | `verbatim` |
| `chat-data`    | host `chat_dir`, including `outputs/` | model      | `verbatim` |
| `webui-data`   | WebUI data volume (HuggingFace cache) | deployment | `confined` |
| `skills-cache` | host `skills_dir`                     | deployment | `confined` |

The manifest component decides the policy; the archive records nothing about it.

**Rules that hold under both policies.** Only the symlink target check is
relaxed. A member whose name-ancestor is a link member is refused. A hardlink
needs a relative target without `..`, must point at an existing non-symlink
member, and must not sit below a link; its source is resolved on disk without
following links. Devices, duplicate names, destination conflicts, the
empty-destination rule and the Python on-disk parent check are unchanged.
Restore therefore never creates a path below a link, never creates a hardlink
through one, and never applies metadata to a link's target.

**GNU tar extract proof.** The extract flags are unchanged. The destination is
a real, empty directory, each name appears once, and no member sits below a
link member, so GNU tar never opens a path through a link that the same archive
created. GNU tar also writes a link whose target is absolute or contains `..` as
a placeholder first and creates the real link at the end of extraction. OCU
PR #163 proves this as root (`OCU_TEST_EXPECT_ROOT=1`, `python:3.13`, GNU tar
1.35; `ubuntu:24.04` ships the same version):

- positive control: a link pre-created in the destination is written through,
  so the harness detects such a write;
- real case: sentinels at an absolute file target, an absolute directory target
  with a trailing slash, and the path `../../outside` resolves to keep their
  bytes, mode, owner, mtime and entry list after extraction;
- Python path: spies show `lchown` touches only the link and no other call lands
  on a link or its target. A mutant that chowns or chmods the link turns red.

**Restore-time host reader.** `_index_snapshot` reads
`chat_dir/<chat>/.ocu/index.json` after `chat-data` is restored. `verbatim`
covers the whole `chat-data` archive, so the reader opens each path component
with `O_NOFOLLOW` (and `O_DIRECTORY` on parents) through the helper it shares
with `_office_blockers`, and a link at any level raises `RecoveryError`.

## Alternatives considered

- **Option 1, skip and record.** Leave absolute or escaping links out of the
  archive and list them in `recovery.json`. Rejected: a restored venv is broken
  until recreated, and `verify` would have to accept a deliberately incomplete
  set.
- **Option 3, exclude regenerable trees by name** (`.venv/`, `node_modules/`,
  caches), or its narrower variant, an allowlist of the entrypoint link paths.
  Rejected: a heuristic that misses links elsewhere, such as a venv under any
  other name, so another option is still needed as the fallback.
- **Option 4, keep refusing with a better message.** Rejected: every started
  sandbox and every venv keeps blocking every user's backup until an operator
  acts.

## Consequences

- Backup succeeds on deployments with started sandboxes and venvs. The
  acceptance VPS run on OCU `bff4f29` published `recovery.json` and passed
  `verify`, with 235 absolute links (47 per workspace volume) and the WebUI
  cache's 30 relative links kept unchanged in the archives
  (DankerMu/open-webui#596).
- A restored workspace keeps its venv and entrypoint links with their original
  targets; the entrypoint recreates its links on the next start anyway.
- The "nothing outside the root" guarantee for model-written trees becomes
  "nothing follows a link", which the tests above pin.
- Older recovery tooling refuses a new set that holds absolute links with
  `unsafe symlink`; `deploy/BACKUP-RESTORE.md` says so.
- A capture refusal after quiesce still leaves the stack stopped (links in a
  deployment-owned tree, sockets or FIFOs, hardlinks to symlinks), tracked in
  DankerMu/open-webui#608. Cross-daemon restore remains untested (#173 B-T14).
