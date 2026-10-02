# Spec Delta

## ADDED Requirements

### Requirement: Restore epoch invalidates edit sessions

Restore SHALL establish a new restore epoch under the restored chat-data root, different from every epoch under which a captured edit session was created. After restore every edit session captured in the set SHALL be reported as orphaned, and reopening its document SHALL create a new session with a new document key. A DocumentServer callback that belongs to a pre-restore session SHALL NOT change a restored workspace file. Stored versions and Office state SHALL be restored byte-identical with the workspace files from the same completed set. A restore that cannot establish the new epoch SHALL NOT publish a ready or success state.

#### Scenario: Pre-restore sessions are orphaned (B-T14)

- **WHEN** a recovery set captured while edit sessions were recorded as open is restored and the deployment is activated
- **THEN** the status of each such session is orphaned
- **AND** reopening the document creates a new session whose document key differs from the captured one

#### Scenario: Late pre-restore callback (B-T14)

- **WHEN** a DocumentServer callback for a session created before the restore arrives after the restore
- **THEN** the restored workspace file and the document's published version are unchanged

#### Scenario: Files, versions and Office state agree (B-T14)

- **WHEN** a set containing workspace files, stored versions and Office state is restored
- **THEN** every version blob and the Office state of every chat match their captured checksums, and the version history lists the same versions with the same numbers, hashes and published flags
- **AND** each workspace file matches the content captured with them

#### Scenario: Epoch cannot be established

- **WHEN** restore cannot write the new restore epoch under the chat-data root
- **THEN** no ready or success state is published and application execution remains stopped

## MODIFIED Requirements

### Requirement: Quiescent complete recovery set

Before stopping any writer, backup SHALL ask DocumentServer to save and close every open document with the shutdown-preparation command the image ships, while OCU is still running to receive the final callbacks; a failure of that step SHALL fail the backup. Backup SHALL then establish and verify a maintenance window with application, initializer, retention, DocumentServer and sandbox writers stopped before capture. PostgreSQL SHALL remain available only for the logical dump and read-only consistency inspection. The complete set SHALL include the database, WebUI data, per-chat directories with the workspace files directory and broker, lifecycle and Office state (there is no uploads tree), skills cache, every deployment-owned sandbox workspace volume, protected deployment configuration and release/version identity. The DocumentServer data volume SHALL NOT be part of the recovery set. The source database SHALL NOT be mutated for orphan pruning. Backup success SHALL be published only after all components and their inventory/checksums are complete. Failure SHALL leave writers stopped and SHALL NOT publish a complete backup or automatically start a sandbox.

#### Scenario: Full cold capture

- **WHEN** an operator requests backup of a valid initialized deployment
- **THEN** all relevant writers are verified stopped before any recovery component is captured, the complete set is published privately, and sandboxes remain stopped
- **AND** detached or stopped deployment workspace volumes are included rather than inferred solely from running containers
- **AND** DocumentServer is among the writers verified stopped, and its data volume is not a component of the set

#### Scenario: Open documents are saved before the window

- **WHEN** backup starts while a document is open in the editor with unsaved input
- **THEN** DocumentServer is asked to save and close it before any writer is stopped, the final callback is processed by OCU, and the captured set holds the resulting version
- **AND** when the shutdown-preparation step fails, backup fails without a complete-set publication

#### Scenario: Quiescence cannot be established

- **WHEN** a writer remains active, discovery is unsupported, or a managed-looking resource cannot be attributed safely
- **THEN** backup fails without a complete-set publication, without deleting resources, and without treating an empty or unrecognized discovery response as proof

#### Scenario: Single-directory chat layout

- **WHEN** per-chat directories hold the workspace files directory and broker, lifecycle and Office state but no uploads tree, and sandboxes mount only the workspace files directory and their workspace volume
- **THEN** backup attributes those sandboxes, and captures each per-chat directory completely, including stored versions and Office state, without requiring an uploads tree

### Requirement: Compatible previous-release activation

One-version rollback SHALL select an explicitly retained previous complete release, including its own source tree, inventory and every verified image that inventory records: six for a release that predates DocumentServer, seven afterwards. Compatibility SHALL be checked against the restored database's migration revisions and PostgreSQL tool/server constraints before activation; the release consumer-format marker alone SHALL NOT establish compatibility. The additive workspace schema SHALL remain present; no downgrade or data deletion SHALL implement rollback. Activation SHALL use the selected release's verified startup path with its port-matrix preflight, proxy-only publication, authentication, network policy and no-build/no-pull behavior. Existing sandbox containers SHALL NOT be deleted or resumed by recovery; restored workspaces SHALL require authorized explicit launch.

#### Scenario: Eligible previous release

- **WHEN** a recovery set is activated using a compatible retained previous release
- **THEN** its own source and images run against the recovered state without rebuilding, pulling, dropping schema or exposing a direct OCU/WebUI entry
- **AND** the operator performs the live port/authorization/readiness checklist before explicitly switching the public entry

#### Scenario: Previous release predates DocumentServer

- **WHEN** the retained previous release has a six-role inventory without DocumentServer
- **THEN** its six images are verified against its own inventory, activation uses that release's own startup path and port-matrix preflight, and the absence of a DocumentServer image is not an incompatibility

#### Scenario: Incompatible rollback candidate

- **WHEN** the previous release cannot recognize the restored schema, lacks the required consumer contract, or has incompatible database tools
- **THEN** activation refuses before application publication and names the incompatibility without downgrading the database
