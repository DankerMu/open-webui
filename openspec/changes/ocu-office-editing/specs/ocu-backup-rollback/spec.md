# Spec Delta

## ADDED Requirements

### Requirement: Restore epoch invalidates edit sessions

Restore SHALL establish a new restore epoch: after the chat-data tree is in place it SHALL write a fresh random token as the single line of `{BASE_DATA_DIR}/.office-restore-epoch`, replacing a captured file of that name and creating the file when the captured set held none. The new token SHALL differ from the captured one and therefore from every epoch under which a captured edit session was created. The marker's format and its reading are owned by `ocu-office-store` (requirement "Restore epoch marker"); recovery SHALL only write the file and SHALL NOT read, compare or interpret epochs. After restore every edit session captured in the set SHALL be reported as orphaned, and reopening its document SHALL create a new session with a new document key. A DocumentServer callback that belongs to a pre-restore session SHALL NOT change a restored workspace file. Stored versions and Office state SHALL be restored byte-identical with the workspace files from the same completed set. A restore that cannot establish the new epoch SHALL NOT publish a ready or success state.

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

#### Scenario: Epoch marker written by restore

- **WHEN** a recovery set is restored, whether or not its captured chat-data tree held `.office-restore-epoch`
- **THEN** after the chat-data tree is in place the file `{BASE_DATA_DIR}/.office-restore-epoch` exists in the restored deployment and holds exactly one line, a token
- **AND** that token differs from the captured one when the set held the file, and the file exists when the set held none

#### Scenario: Epoch cannot be established

- **WHEN** restore cannot write `{BASE_DATA_DIR}/.office-restore-epoch`
- **THEN** no ready or success state is published and application execution remains stopped

## MODIFIED Requirements

### Requirement: Quiescent complete recovery set

Backup SHALL quiesce Office editing before it stops the remaining writers, in four steps taken in this order. Step 1: it SHALL stop the proxy, so that no browser request reaches WebUI, OCU or DocumentServer and no edit session can start. Step 2: while OCU is still running to persist and publish the final callbacks, it SHALL ask DocumentServer to save and close every open document with the shutdown-preparation command that the B1 verification record names. Step 3: it SHALL wait, up to a configured timeout that is longer than the session sweep's liveness interval, until no chat's Office state holds a session in `opening`, `editing`, `saving` or `closing` and none holds a journal entry; the check SHALL read the Office state files and SHALL NOT call OCU. Step 4: it SHALL stop the remaining writers, DocumentServer among them, and capture. If step 2 fails or step 3 times out, backup SHALL name the sessions still open, SHALL stop the writers and SHALL NOT publish a complete set. DocumentServer SHALL leave its shutdown mode when the deployment is next started, with no separate step in backup to clear it. Backup SHALL establish and verify a maintenance window with application, initializer, retention, DocumentServer and sandbox writers stopped before capture. PostgreSQL SHALL remain available only for the logical dump and read-only consistency inspection. The complete set SHALL include the database, WebUI data, per-chat directories with the workspace files directory and broker, lifecycle and Office state (there is no uploads tree), skills cache, every deployment-owned sandbox workspace volume, protected deployment configuration and release/version identity. The DocumentServer data volume SHALL NOT be part of the recovery set. The source database SHALL NOT be mutated for orphan pruning. Backup success SHALL be published only after all components and their inventory/checksums are complete. Failure SHALL leave writers stopped and SHALL NOT publish a complete backup or automatically start a sandbox.

#### Scenario: Full cold capture

- **WHEN** an operator requests backup of a valid initialized deployment
- **THEN** all relevant writers are verified stopped before any recovery component is captured, the complete set is published privately, and sandboxes remain stopped
- **AND** detached or stopped deployment workspace volumes are included rather than inferred solely from running containers
- **AND** DocumentServer is among the writers verified stopped, and its data volume is not a component of the set

#### Scenario: Open document is saved before capture

- **WHEN** backup starts while a document is open in the editor with unsaved input
- **THEN** after the proxy is stopped DocumentServer is asked to save and close the document, OCU processes the final callback, and the session has left `opening`, `editing`, `saving` and `closing` before the remaining writers are stopped
- **AND** the captured set holds the resulting version

#### Scenario: Session still saving at the timeout

- **WHEN** the wait of step 3 reaches its timeout while a chat's Office state still holds a session in `saving`
- **THEN** backup fails naming that session, publishes no complete set and leaves the writers stopped
- **AND** a journal entry that remains at the timeout fails the backup in the same way

#### Scenario: Shutdown-preparation command fails

- **WHEN** the shutdown-preparation command of step 2 cannot be run or reports a failure
- **THEN** backup fails naming the sessions that the Office state files still show as open, stops the writers and publishes no complete set

#### Scenario: No browser request after the proxy is stopped

- **WHEN** a browser sends a request for WebUI, for an OCU route or for the DocumentServer origin after step 1
- **THEN** the request reaches none of WebUI, OCU and DocumentServer, and no edit session is created between step 1 and the capture

#### Scenario: DocumentServer leaves its shutdown mode at the next start

- **WHEN** the deployment is started again after a backup, successful or failed, that ran the shutdown-preparation command
- **THEN** DocumentServer accepts a new edit session without an operator step that clears the shutdown mode

#### Scenario: Quiescence cannot be established

- **WHEN** a writer remains active, discovery is unsupported, or a managed-looking resource cannot be attributed safely
- **THEN** backup fails without a complete-set publication, without deleting resources, and without treating an empty or unrecognized discovery response as proof

#### Scenario: Single-directory chat layout

- **WHEN** per-chat directories hold the workspace files directory and broker, lifecycle and Office state but no uploads tree, and sandboxes mount only the workspace files directory and their workspace volume
- **THEN** backup attributes those sandboxes, and captures each per-chat directory completely, including stored versions and Office state, without requiring an uploads tree

### Requirement: Compatible previous-release activation

One-version rollback SHALL select an explicitly retained previous complete release, including its own source tree, inventory and every verified image that inventory records: six for a release that predates DocumentServer, seven afterwards. The retained release's inventory SHALL be loaded and verified by its own format version: a version-1 inventory, which predates DocumentServer, has six roles and no font bundle, even though a newly built release SHALL be version 2 with seven roles and a font bundle (`ocu-offline-image-delivery`); the current recovery tooling SHALL NOT reject a retained release because its inventory lacks the DocumentServer role or the font bundle. This activation path — recovery's release selection, including the import it performs — SHALL be the only place where a version-1 inventory is accepted; a version-1 release has no font bundle, recovery places no `fonts` entry for it, and it starts through its own deployment entry, which makes no font check. For a version-2 release, on restore as on activation, recovery SHALL place the `fonts` entry beside the published inventory as `ocu-offline-image-delivery` specifies. Compatibility SHALL be checked against the restored database's migration revisions and PostgreSQL tool/server constraints before activation; the release consumer-format marker alone SHALL NOT establish compatibility. The additive workspace schema SHALL remain present; no downgrade or data deletion SHALL implement rollback. Activation SHALL use the selected release's verified startup path with its port-matrix preflight, proxy-only publication, authentication, network policy and no-build/no-pull behavior. Existing sandbox containers SHALL NOT be deleted or resumed by recovery; restored workspaces SHALL require authorized explicit launch.

#### Scenario: Eligible previous release

- **WHEN** a recovery set is activated using a compatible retained previous release
- **THEN** its own source and images run against the recovered state without rebuilding, pulling, dropping schema or exposing a direct OCU/WebUI entry
- **AND** the operator performs the live port/authorization/readiness checklist before explicitly switching the public entry

#### Scenario: Previous release predates DocumentServer

- **WHEN** the retained previous release has a version-1 inventory: six roles, no DocumentServer and no font bundle
- **THEN** the current recovery tooling loads that inventory by its six roles, verifies its six images against it, and activation succeeds through that release's own startup path and port-matrix preflight
- **AND** the absence of a DocumentServer role, image and font bundle is not reported as an incompatibility, while a newly built or imported release with six roles or without a font bundle is still rejected as incomplete

#### Scenario: Incompatible rollback candidate

- **WHEN** the previous release cannot recognize the restored schema, lacks the required consumer contract, or has incompatible database tools
- **THEN** activation refuses before application publication and names the incompatibility without downgrading the database
