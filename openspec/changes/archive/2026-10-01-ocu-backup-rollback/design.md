# Design

## Context

The release consumer in OCU `deploy/release.py` binds six image IDs, both source commits and tracked initializer bytes. Its import publishes an installation without retaining image archives; an installed `release.json` is not a full delivery directory. `deploy/up.sh` derives its source root from its own location, freezes checked Compose documents and starts core/WebUI/proxy without builds or pulls.

Persistent state spans PostgreSQL, WebUI's data volume, host chat/skills directories and daemon-global `chat-<chat_id>-workspace` volumes. Container names are also daemon-global. The user selected complete cold backup and restoration to a distinct empty daemon/host, not in-place overwrite.

## Goals / Non-Goals

Provide one tracked operational backup/verify/restore/activate procedure with bounded failure states and a runnable recovery checklist. Preserve ownership, broker identity, stopped-workspace semantics and security policy.

No live snapshots, in-place destructive restore, database downgrade, daemon migration service, encryption/key-management service, automatic traffic cutover or rollback to the pre-release unchecked deployment. No unrelated application or schema changes. Untracked operator sketches are not adopted or edited.

## Decisions

### Maintenance window, not distributed snapshotting

Use the existing local Docker selection and identity logic, with a cooperating recovery-operation lock. Select the deployed stack by checked configuration plus inspected container identities/mounts, not substring name matching. Refuse ambiguous managed-looking resources. Stop ingress and application/initializer/lifecycle writers first so no new sandbox or file write can be admitted; stop and re-inspect attributed sandbox containers before capture. Keep only the selected PostgreSQL service available for dump/read-only inspection. Verify expected writers remain stopped at the capture boundary; do not infer success solely from stop exit status. An external administrator bypassing the maintenance window is outside the cooperating-writer guarantee.

Capture every attributed workspace volume, including volumes without running containers. Correlate names with canonical chat metadata/database identity and inspected mounts; never silently include or stop unrelated resources. Unattributable matching resources block with an operator-visible ambiguity, rather than being dropped. Explicit maintenance means no automatic resume on success or failure; the operator may start the source stack through its normal verified entry after publication, while sandbox launch remains explicit.

### One recovery manifest, existing release authority

A versioned recovery manifest indexes recovery components and hashes, source daemon/deployment identity, schema revisions and a copy/hash of the canonical release inventory. It does not define a second image identity schema. Include logical DB dump, full WebUI data (including initializer marker), chat and skills trees, all workspace volumes, runtime/admin configuration and the deployment version record. Required image delivery archives are retained separately and verified through release.py; reference their inventory identity in the checklist rather than duplicating large image archives in every backup.

The separately provisioned provider credential file is excluded; credential values already persisted in the complete database are not excluded or sanitized. Treat the entire backup as secret-bearing: root-only operation, 0700 owned directories, 0600 metadata/config artifacts, no secret contents in logs or command arguments. Restored persistent provider settings retain the application's existing precedence over environment defaults; a different target file does not promise credential replacement. The readiness checklist inspects effective settings and requires any desired change through the normal administrator path, not an implicit recovery rewrite. Read dotenv as inert key/value data, never shell-source/eval it. Preserve literal dollars and reject malformed/duplicate entries.

Stage components privately; validate all members and publish one complete directory exclusively. Failure never publishes a complete manifest or deletes unrelated resources. Cancellation ownership must cover allocation handoff; do not copy the known issue102 leak into the recovery procedure.

### Filesystem preservation with confined extraction

Use a single capture/extract implementation for host trees and mounted volume trees. Preserve numeric owners, modes, symlinks/hardlinks and supported ACL/xattrs; do not dereference links during capture. Restore into private empty roots with no member traversing a link or escaping through absolute/parent paths. Reject duplicate/prefix-conflicting members, device/FIFO/socket entries and unsupported metadata explicitly. Check archive membership and quotas before restore mutation; do not assume OCI archive validators handle filesystem extraction.

The volume helper runs only a verified local release image, with no pull, no network and narrowly scoped mounts. Never infer helper utility availability solely from the image name: source inspection and fake contract cover development; actual utilities, metadata fidelity and engine mount semantics require final acceptance. Prefer stdlib/existing image utilities over a new helper image or dependency.

### Empty isolated target and failure state

Restore requires explicit target selection, a daemon identity unequal to the captured source, no colliding fixed stack/chat containers or selected volumes, and an absent destination root. The supported recovery topology uses the standard local `unix:///var/run/docker.sock`, matching the existing runtime mounts; reject other endpoint arrangements before allocation rather than adding socket-layout support. Pin this endpoint explicitly in every helper and startup subprocess environment (remove conflicting context selection), verify its daemon identity consistently, and retain the same socket mapping in the resolved runtime configuration. Real host/VM socket mapping remains final acceptance evidence. Recheck target emptiness at allocation under the recovery lock. A Compose project rename is not isolation. No reset/removal/prune command is implicit.

Materialize a new protected config from captured values, substituting only declared target-root paths, the separately supplied provider-file path and selected release identity fields. Existing target files are never overwritten. Preserve credentials and policy values; reject unsupported external data roots instead of silently changing their meaning. Root-scoped data paths may be remapped as one declared operation; provider credentials are a separate protected input. Do not run bootstrap over a restored configuration.

Restore all files and workspace volumes before application startup; create only the empty target PostgreSQL resources needed to restore its logical database, isolated from public entry. A failure leaves owned partial resources with no ready marker and no application/proxy/sandbox start. Report resource identities, not secrets. Subsequent restore into that populated target fails; explicit operator disposal or a different empty target is required. No claim of an atomic transaction across Docker, PostgreSQL and files.

### Database integrity and compatible rollback

Prune orphan `ocu_chat_state` rows only inside the restored target database using the existing chat primary-key relation, in a transaction. Do not edit the source database or try to modify a custom-format pg_dump archive. Inspect restored ownership/cursors and broker counters: live cursors must not exceed recovered authoritative counters, and file IDs/revisions are not rewritten. Preserve the initialized WebUI marker and seeded DB configuration; missing marker fails rather than inviting automatic re-seeding.

The operator supplies a retained previous release and its full offline delivery if images need import. Validate its source/images through existing release APIs. Run compatibility inspection using the selected verified local WebUI image and PostgreSQL tooling without starting the app or exposing a port: the restored Alembic revision must be recognized by the target migration graph and must not require downgrade; database dump/tool/server direction must be supported. A successful source-consumer marker does not prove these properties. Keep the additive workspace table. Compatibility inspection failures are terminal, not bypassable warnings.

Activation runs the selected release's own imported `source/deploy/up.sh`, with an inert private activation environment containing the preserved security settings plus allowlisted release identities. The existing startup path performs source/image verification, resolved service-image checks and port-matrix validation before network mutation. Do not fork its policy implementation. Image-only tag switching under a different source checkout is forbidden. Restored workspaces have data/metadata but no automatically running containers; explicit authorized launch uses the selected workspace image and recovered volume.

The restored deployment root owns `source/` and `release.json` for the selected release so the existing version-record consumer resolves the correct source. Preserve the captured version record as backup provenance; regenerate the active record from the selected release after activation. Do not present the captured source identity as the active rollback version.

The post-start checklist runs the existing live smoke/port checks, verifies ownership/output/revision and stopped-launch behavior, then permits explicit operator traffic switch. `compose up -d` is not readiness. A failed activation may leave partial stopped/running service resources but must not be reported ready; do not destructively roll them back.

## Verification and references

Extend `tests/deploy/fakebin/docker` and existing support for stateful volume, helper and database interactions, with unknown operations failing loudly. A fake PostgreSQL boundary proves orchestration and recorded effects, not actual PostgreSQL restore semantics. Parent-owned throwaway scenarios compare restored bytes/IDs/modes and resource states, and qualify quiescence, confinement, occupied-target and schema guards with historical/bypass negative controls. Preserve original protected expectations across repair.

References: OCU `deploy/release.py` inventory/source/image APIs; `deploy/up.sh`; `deploy/production-like-test/{compose.core.override.yml,compose.webui.override.yml,init/run-init.sh}`; `computer-use-server/docker_manager.py` mount and explicit-launch paths; WebUI `models/ocu_chat_state.py`, `models/chats.py`, `config.py` Alembic startup; integration spec `lan-deployment-overlay` and design D14. Source reports `/tmp/BackupConsistencyScout.json` and `/tmp/RestoreReleaseScout.json` are discovery evidence, not implementation authority.

## Risks / Trade-offs

- Maintenance downtime is required to join DB/file identity; live-copy convenience is rejected.
- Isolated restore consumes a second host/daemon but avoids destructive in-place rollback and global-name collisions.
- Full workspace volumes increase backup size; excluding them contradicts the selected recovery scope.
- Checksums detect corruption, not hostile-admin forgery; backup/import inputs remain administrator-controlled.
- Actual archive metadata, PostgreSQL compatibility and two eligible release versions require final A-T15 proof. No particular previous release is pre-certified.

## Migration Plan

Keep current release import/bootstrap contracts. Document the tracked recovery entrypoint separately from untracked local sketches. Retain a previous compatible release delivery and a completed recovery set before deployment changes. Merge source with Docker-free evidence, leave issue34/fixture open, then execute isolated engine recovery and A-T14/A-T15 in issue36 before closing them.
