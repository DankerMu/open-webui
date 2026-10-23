## Why

#608. In the sibling `open-computer-use` checkout at `origin/main` `bff4f29`, `deploy/recovery_resources.py` `backup_deployment` (`:701`) calls `establish_quiescence` (`:497`), which stops the proxy, DocumentServer, the writers and the sandboxes (`_quiesce_and_discover`, `:533`) before any tree is captured. The capture walk only runs afterwards, so these refusals leave the whole stack stopped until an operator runs `deploy/up.sh`:

- an absolute or escaping symlink in a deployment-owned tree (`webui-data`, `skills-cache`, policy `confined`);
- a socket or FIFO in any tree (`recovery_fs._walk_tree` → `unsupported file type`, `deploy/recovery_fs.py:315-333`);
- a hardlink to a symlink in any tree: GNU tar emits it as a hardlink member whose target is a symlink, and `validate_archive` refuses it (`hardlink … may not target a symlink`, `:467-472`).

`deploy/BACKUP-RESTORE.md:35` states that backup never restarts the stack; the next normal deployment start clears DocumentServer's shutdown mode.

## What Changes

Owner decision on #608 (2026-10-23): option 1, a read-only scan before quiesce.

- `deploy/recovery_fs.py` gains `scan_tree(root, *, links, live=False)`: the walk plus every source-side refusal the GNU-tar capture makes (unsupported member type, member limit, byte limit, symlink target under the policy, two in-tree names for one symlink inode). It reads only. `capture_tree` calls it first, so capture and scan share one predicate. With `live=True` an entry that vanishes during the walk is skipped, because the stack is still running.
- `deploy/recovery_helper.py` gains `scan --links=<policy> [--live] <source>`.
- Before it stops anything, and before the `try:` whose failure path stops the writers, backup scans every tree it will capture with the policy from `LINK_POLICY`: the host `chat_dir` and `skills_dir` directly, and the WebUI data volume and every workspace volume of the deployment's chats through the helper with a read-only mount. It also probes the WebUI initializer marker. Any refusal fails the backup with the stack untouched: no container stopped, no DocumentServer shutdown command, no stage allocated.
- The post-quiesce capture keeps every check, so a tree that changes between scan and quiesce is still refused (and still leaves the stack stopped, as today).
- `BACKUP-RESTORE.md` describes the scan and its limits: the scan–quiesce race, Python-fallback xattr/ACL refusals and failures the scan cannot predict, such as a full disk, still leave the stack stopped.
- Depends on #616 (capture's strict UTF-8 encoding of the GNU-tar file list), fixed first, so non-UTF-8 names are capturable and need no scan rule.

## Capabilities

### Modified Capabilities

- `ocu-backup-rollback`: new requirement "Backup refuses an uncapturable tree before it stops the stack".

## Impact

- The three triggers fail fast with every service still running.
- Backup takes one extra read-only walk of each tree and one helper container run per volume.

## Triage

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded: backup entrypoint, file IO and path safety, shared capture predicate, rollback state
Blast radius: every backup; a scan looser than capture keeps the bug, a stricter one refuses valid backups; a scan that mutates a live tree corrupts user data
Selected risk packs: Public API / CLI / script entry; File IO / path safety; Error handling / rollback / partial outputs; Concurrency / ordering; Resource limits / large input; Documentation
Evidence floor: tests/deploy/test_recovery.py fake-harness tests, one per trigger, red before / green after; tests/deploy/test_recovery_fs.py for scan_tree; the deploy suite in the CI-shaped container as non-root; ./tests/test-project-structure.sh
```
