# ocu-backup-rollback Specification

## Purpose

Recover a coherent workspace deployment from a full cold backup on an isolated empty target, including compatible previous-release activation without widening permissions or losing revision identity.

## Requirements

### Requirement: Quiescent complete recovery set

Backup SHALL establish and verify a maintenance window with application, initializer, retention and sandbox writers stopped before capture. PostgreSQL SHALL remain available only for the logical dump and read-only consistency inspection. The complete set SHALL include the database, WebUI data, per-chat directories with uploads/outputs/broker/lifecycle metadata, skills cache, every deployment-owned sandbox workspace volume, protected deployment configuration and release/version identity. The source database SHALL NOT be mutated for orphan pruning. Backup success SHALL be published only after all components and their inventory/checksums are complete. Failure SHALL leave writers stopped and SHALL NOT publish a complete backup or automatically start a sandbox.

#### Scenario: Full cold capture

- **WHEN** an operator requests backup of a valid initialized deployment
- **THEN** all relevant writers are verified stopped before any recovery component is captured, the complete set is published privately, and sandboxes remain stopped
- **AND** detached or stopped deployment workspace volumes are included rather than inferred solely from running containers

#### Scenario: Quiescence cannot be established

- **WHEN** a writer remains active, discovery is unsupported, or a managed-looking resource cannot be attributed safely
- **THEN** backup fails without a complete-set publication, without deleting resources, and without treating an empty or unrecognized discovery response as proof

### Requirement: Validated recovery artifact

A recovery set SHALL identify its source daemon, source deployment and release inventory, database schema revisions, exact component membership and checksums. Recovery SHALL reject missing, corrupt, duplicate, unconfined or mixed components before destination data mutation. Backup directories and credential-bearing artifacts SHALL be root-private; credentials SHALL NOT appear in arguments, logs, reports or the secret-free image delivery bundle. Filesystem capture/restore SHALL preserve contents, link identity, numeric ownership, modes and supported ACL/xattr metadata without extracting outside an owned empty destination. Unsupported metadata or file types SHALL fail explicitly rather than silently omit data or widen permissions.

#### Scenario: Tampered or incomplete set

- **WHEN** any component is missing, replaced, unsafe or inconsistent with the recovery inventory
- **THEN** restore refuses before creating destination database/data resources and leaves existing resources unchanged

#### Scenario: Permission-sensitive files

- **WHEN** protected files and supported links or ACL/xattr metadata are recovered
- **THEN** their content and access restrictions are retained, and no archive member can escape the selected destination

### Requirement: Isolated empty-target restore

Restore SHALL require an explicitly selected local target daemon different from the source daemon and a new destination root with no conflicting deployment containers, database, data or workspace volumes. A different Compose project name alone SHALL NOT count as isolation. Every recovery helper, startup subprocess and runtime socket consumer SHALL address that same target daemon; unsupported or mismatched socket layouts SHALL be rejected before allocation. Restore SHALL NOT overwrite existing configuration, delete existing resources, or execute captured configuration as shell code. The separately provisioned provider credential file SHALL be excluded and supplied through a protected target file, but credential values persisted in the full database SHALL remain in the secret-bearing backup. Restored persistent provider settings SHALL retain their existing precedence over environment defaults; recovery SHALL NOT sanitize or silently replace them. Target path substitutions SHALL be limited to declared deployment paths; secrets and security policy SHALL not change implicitly.

#### Scenario: Existing or same-daemon target

- **WHEN** the target is the source daemon, contains colliding resources, or the destination is occupied
- **THEN** restore refuses before modifying those resources

#### Scenario: Runtime socket addresses another daemon

- **WHEN** the selected target differs from the daemon exposed by the runtime socket mounts
- **THEN** restore refuses before allocation or activation and neither daemon's resources change

#### Scenario: Persistent provider credentials differ from defaults

- **WHEN** restored persistent provider settings contain credential A and the target provider file supplies default B
- **THEN** recovery preserves the database settings and the application's existing persistent-config precedence, does not claim B replaced A, and discloses neither value in logs or arguments
- **AND** the operator checks effective provider settings before readiness and explicitly changes them through the normal administration path if needed

#### Scenario: Partial restore failure

- **WHEN** database or filesystem restoration fails after target allocation
- **THEN** no ready/success state is published, proxy/application/sandbox execution remains stopped, and the failure identifies owned partial resources without destructive cleanup
- **AND** retry against the now-populated target refuses; an operator must explicitly discard the disposable target or select a fresh one

### Requirement: Coherent database and workspace recovery

Restore SHALL recover the database and files from the same completed set. It SHALL prune only `ocu_chat_state` rows with no corresponding chat in the restored database, preserving surviving ownership, preferences and cursors. Broker file IDs, revisions and counters SHALL remain unchanged. A surviving cursor beyond its recovered broker counter SHALL cause failure rather than fabricated revisions or cursor resets. Initialized WebUI state SHALL retain its initializer completion marker and configuration so startup does not reseed operator-managed tools, filters or models.

#### Scenario: Restore ownership and revisions

- **WHEN** a set containing live chats and orphan workspace-state rows is restored
- **THEN** live chat owners, outputs, file IDs, revisions and preferences are intact, only orphan state rows are removed, and initialization does not overwrite restored settings

#### Scenario: Skewed recovery state

- **WHEN** a surviving workspace cursor is newer than the recovered authoritative broker state or initialized data is missing its marker
- **THEN** recovery fails closed without claiming readiness or silently resetting state

### Requirement: Compatible previous-release activation

One-version rollback SHALL select an explicitly retained previous complete release, including its own source tree, inventory and all six verified images. Compatibility SHALL be checked against the restored database's migration revisions and PostgreSQL tool/server constraints before activation; the release consumer-format marker alone SHALL NOT establish compatibility. The additive workspace schema SHALL remain present; no downgrade or data deletion SHALL implement rollback. Activation SHALL use the selected release's verified startup path with its port-matrix preflight, proxy-only publication, authentication, network policy and no-build/no-pull behavior. Existing sandbox containers SHALL NOT be deleted or resumed by recovery; restored workspaces SHALL require authorized explicit launch.

#### Scenario: Eligible previous release

- **WHEN** a recovery set is activated using a compatible retained previous release
- **THEN** its own source and images run against the recovered state without rebuilding, pulling, dropping schema or exposing a direct OCU/WebUI entry
- **AND** the operator performs the live port/authorization/readiness checklist before explicitly switching the public entry

#### Scenario: Incompatible rollback candidate

- **WHEN** the previous release cannot recognize the restored schema, lacks the required consumer contract, or has incompatible database tools
- **THEN** activation refuses before application publication and names the incompatibility without downgrading the database

### Requirement: Separate source and engine acceptance

Docker-free checks SHALL exercise recovery ordering and observable data/resource state without claiming actual engine or PostgreSQL behavior. Real isolated-host restore, previous-version activation, ownership/permission checks and A-T14/A-T15 evidence SHALL remain mandatory after all source development in issue36. Issue34 SHALL remain open and this fixture active until those criteria pass.

#### Scenario: Source milestone

- **WHEN** fake-boundary tests, independent cross-review and source CI pass
- **THEN** source may merge with deferred engine evidence explicitly recorded, but A-T14/A-T15 and issue34 are not marked complete

### Requirement: Confined relative symlinks in captured trees

Filesystem capture and restore SHALL accept a symbolic link whose target is relative and, ignoring `.` and empty components, consists of zero or more leading `..` components followed only by normal components (no later `..` component), and whose number of leading `..` components does not exceed the depth of the link's parent directory below the captured root. An empty target SHALL be refused. Such a link SHALL be captured and restored with its target unchanged. Any other symbolic link, including absolute targets and targets that would resolve outside the captured root, SHALL fail capture, verification and restore without creating destination data. Capture and restore SHALL apply the same rule on every archive path. Restore through the Python fallback SHALL NOT create a member or apply its metadata through a symbolic link in the member's parent chain on disk, whatever the destination filesystem's name rules; the GNU tar path relies on GNU tar's handling and the post-extraction check.

#### Scenario: HuggingFace cache in the WebUI data volume

- **WHEN** a captured tree contains `models--x/snapshots/r1/model.safetensors -> ../../blobs/abc` and `models--x/blobs/abc`
- **THEN** capture succeeds, and restore into an empty destination recreates the link with target `../../blobs/abc`, through which the blob's bytes are read

#### Scenario: Escaping link

- **WHEN** an archive or a captured tree contains a link such as `x -> ../y` at the root, `a/x -> ../../y`, `a/b/x -> a/../../../y`, `a/x -> b/../y`, or `a/x -> /etc/passwd`
- **THEN** capture, verification or restore fails with `unsafe symlink` and nothing is created in the destination

#### Scenario: Links accepted before stay accepted

- **WHEN** a captured tree contains links without `..` such as `a/x -> ./y`, `a/x -> b//y` or `a/x -> .`
- **THEN** capture and restore succeed and the links keep their targets

#### Scenario: Name alias on a case-insensitive filesystem

- **WHEN** an archive restored through the Python fallback holds `d/L -> ..`, `d/l/M -> ../..` and `d/l/m/evil`, and the destination filesystem treats `d/l` and `d/L` as one entry
- **THEN** restore fails with `unsafe parent` (or `existing target` when the alias collides with an already created directory) before writing through the link, and no file is created outside the destination

### Requirement: Recovery helper failures name their cause

When a recovery helper container that captures or restores a volume exits unsuccessfully, the resulting error SHALL include the helper's reported reason (its standard error, or standard output when standard error is empty), bounded in length, together with the volume name.

#### Scenario: Volume capture refused by the helper

- **WHEN** the helper capturing a volume exits with an error reporting `unsafe symlink a/b`
- **THEN** the backup error names the volume and contains `unsafe symlink a/b`
