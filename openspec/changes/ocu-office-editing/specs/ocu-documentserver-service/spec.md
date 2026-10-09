# Spec Delta

## Purpose

The ONLYOFFICE DocumentServer service in the LAN deployment overlay (OCU `deploy/`): network placement, its own browser origin through the reverse proxy's second listener, JWT configuration, server-to-server addressing, data volume, fonts, the single deployment shape and the acceptance-machine profile. Source: Plan 2 § 编辑器选型与机器, § 关键设计 6 部署, 验收矩阵 B-T15; design D17, D18, D19, D20.

## ADDED Requirements

### Requirement: Control-plane placement without host exposure

DocumentServer SHALL run as a compose service of the deployment, attached to the control-plane network only. It SHALL NOT join the sandbox network, SHALL NOT use host or shared-container networking, and SHALL publish no host port, including loopback. It SHALL NOT mount the Docker socket, the chat-data tree, the skills cache or any sandbox workspace volume; it SHALL have no mount other than volumes that hold DocumentServer's own data and the two font directories. It SHALL run the unmodified upstream image identified by the release inventory.

#### Scenario: Running service inspected

- **WHEN** the deployed DocumentServer container is inspected
- **THEN** it is attached to the control-plane network and to no other network, and it has no published host port
- **AND** the Docker socket, the chat-data tree, the skills cache and every sandbox workspace volume are absent from its mounts, and no host path other than the two font directories is mounted

#### Scenario: Image identity

- **WHEN** the running DocumentServer container's image is compared with the release inventory
- **THEN** its configuration digest equals the inventory's DocumentServer entry and no derived or locally built image is in use

#### Scenario: Resolved service is independent of the editing flag

- **WHEN** the actual core and WebUI stacks are resolved with the Office flag on and off
- **THEN** DocumentServer remains present in core without a profile or build, using the release-selected image and only the control-plane network
- **AND** it has no publication or non-font host bind, and its named data, cache and log volume bindings remain identical
- **AND** the OCU environment carries the four existing configuration-module names with nonempty values, while WebUI carries the selected flag

### Requirement: Own browser origin behind the proxy's second listener

Browsers SHALL reach DocumentServer only through the reverse proxy's second listener, which is published on its own host port. The browser-facing DocumentServer origin SHALL therefore differ from the WebUI origin, so that script running in the editor origin cannot read WebUI's origin-scoped storage. Every request on that listener, HTTP and WebSocket handshake alike, SHALL require a valid WebUI session; a request without one SHALL receive 401 and SHALL NOT reach DocumentServer.

#### Scenario: Signed-in browser loads the editor

- **WHEN** a browser holding a valid WebUI session cookie requests the DocumentServer JS API and opens the editor WebSocket on the DocumentServer origin
- **THEN** both requests reach DocumentServer through the second listener and succeed

#### Scenario: Anonymous request

- **WHEN** a client without a valid WebUI session requests any path, or attempts a WebSocket handshake, on the DocumentServer listener
- **THEN** the response is 401 and DocumentServer receives no request

#### Scenario: Editor origin cannot read WebUI storage

- **WHEN** script served from the DocumentServer origin reads `localStorage` in a browser that is signed in to WebUI
- **THEN** it does not see WebUI's token, because the DocumentServer origin and the WebUI origin differ

### Requirement: JWT in every direction with a bootstrap-generated secret

DocumentServer SHALL run with JWT validation enabled for browser requests, for inbound server requests (inbox) and for its own outbound requests (outbox), all using one secret generated at bootstrap. The resolved compose configuration of the DocumentServer service SHALL enable JWT for browser requests, for the inbox and for the outbox, each with the bootstrap-generated secret, the same value OCU receives. The deployment entry SHALL refuse to start when that resolved configuration disables JWT for any of the three or carries an empty secret. The secret SHALL NOT appear in logs, in the deployment version record, or in anything delivered to a browser; the editor configuration delivered to a browser SHALL carry only a signature made with the secret, never the secret itself.

#### Scenario: Resolved configuration inspected

- **WHEN** the resolved compose configuration of the DocumentServer service is inspected
- **THEN** JWT is enabled for browser requests, for the inbox and for the outbox, and each of the three uses the secret generated at bootstrap, which is the value OCU is configured with

#### Scenario: JWT disabled or secret empty

- **WHEN** the resolved configuration disables JWT for browser requests, for the inbox or for the outbox, or its secret is empty
- **THEN** the deployment entry exits nonzero naming the setting, starts no service and prints no credential value

#### Scenario: Unsigned or wrongly signed request

- **WHEN** an editor configuration or a command-service request reaches DocumentServer without a token, or with a token signed by a different secret
- **THEN** DocumentServer rejects it

#### Scenario: Outbound requests are signed

- **WHEN** DocumentServer fetches a document source or posts a save callback
- **THEN** the request carries a token signed with the configured secret

#### Scenario: Secret not disclosed

- **WHEN** service logs, the deployment version record, the editor host page and the editor configuration returned to the browser are inspected
- **THEN** none of them contains the secret value

### Requirement: Server-to-server traffic on control-plane addresses

The Office broker SHALL reach DocumentServer's command service and download URLs on DocumentServer's control-plane address, and DocumentServer SHALL reach the broker's source and callback routes on OCU's control-plane address. Neither direction SHALL pass through the reverse proxy or use a browser-facing origin.

#### Scenario: Source fetch and callback

- **WHEN** DocumentServer opens a document and later reports a save
- **THEN** its source and callback requests arrive at OCU directly over the control-plane network, and the reverse proxy receives no request for them

#### Scenario: Broker command and download

- **WHEN** the broker requests a save and downloads the saved content
- **THEN** both requests are addressed to DocumentServer's control-plane address, not to the browser-facing DocumentServer origin

### Requirement: No WAN dependency

DocumentServer SHALL need no WAN egress at start or in operation: no public CDN, no online conversion service and no external document service. The deployment SHALL run Office editing with WAN access denied.

#### Scenario: Office editing with WAN blocked (B-T15)

- **WHEN** WAN access is blocked and the deployment, including DocumentServer, is restarted
- **THEN** DOCX, XLSX and PPTX documents open, accept an edit and save, with Chinese text rendered in the shipped CJK fonts
- **AND** no service attempts a WAN connection, an image build or an image pull

### Requirement: Persistent data volume outside the recovery set

DocumentServer's data SHALL live on a named volume that survives a restart or recreation of the service. That volume SHALL NOT be part of the backup recovery set; the authoritative Office data is the broker's per-chat state and versions inside the chat-data tree.

#### Scenario: Service restart

- **WHEN** the DocumentServer service is restarted or its container is recreated
- **THEN** the same data volume is attached again and the service starts without reinitialising it

#### Scenario: Recovery set membership

- **WHEN** a complete recovery set is published for a deployment that runs DocumentServer
- **THEN** the set contains no DocumentServer data volume component

### Requirement: Shipped and operator-supplied fonts

The release SHALL carry open-source CJK fonts — Noto Sans CJK SC and Noto Serif CJK SC — as the font bundle that `ocu-offline-image-delivery` specifies: pinned by `deploy/fonts/fonts.json`, built into the release package, and installed by import as the directory `fonts/` in the install root. The release font directory SHALL be the entry `fonts` beside the installed inventory that `OCU_RELEASE_MANIFEST` names; the deployment entry SHALL derive `OCU_RELEASE_FONTS_DIR` from it at every start and export it for compose, and it SHALL NOT be a stored setting, so that a restore or a rollback that selects another release root needs no remapping. That directory SHALL be mounted read-only into DocumentServer. Their font files SHALL NOT be committed to either repository. A second, operator-owned directory, at the path in `OCU_OFFICE_FONTS_DIR`, SHALL be mounted read-only the same way for fonts supplied by the deploying organisation; bootstrap SHALL create it empty when it does not exist and SHALL never write a font into it or remove one from it. DocumentServer SHALL load the fonts of both directories at start. Operator-supplied fonts SHALL NOT be contained in either repository or in the release package.

#### Scenario: Fonts available after start

- **WHEN** DocumentServer starts with the release font directory and an operator directory that holds a supplied font
- **THEN** the editor's font list offers the shipped CJK fonts and the supplied font

#### Scenario: Supplied font added later

- **WHEN** an operator places a font in the operator-owned directory and restarts DocumentServer
- **THEN** the font is available in the editor without rebuilding or re-importing any image

#### Scenario: Release package contents

- **WHEN** both repositories and a built release package are inspected
- **THEN** the release package contains the open-source CJK fonts as its font bundle, and the bundle's SHA-256 matches the `font_bundle` entry of the release inventory
- **AND** neither repository contains a font file for them
- **AND** no operator-supplied font is in either repository or in the release package

#### Scenario: Font mounts in the resolved configuration

- **WHEN** the resolved compose configuration of the DocumentServer service is inspected
- **THEN** it mounts the directory in `OCU_RELEASE_FONTS_DIR` and the directory in `OCU_OFFICE_FONTS_DIR`, both read-only, at two different font paths inside the container, and no other host path

#### Scenario: Release font directory follows the installed inventory

- **WHEN** the deployment is started after a restore and activation that selected a release root other than the one the captured configuration named
- **THEN** `OCU_RELEASE_FONTS_DIR` is the `fonts` entry beside the inventory `OCU_RELEASE_MANIFEST` names, DocumentServer mounts the fonts of the selected release, and no stored setting had to be rewritten for it

#### Scenario: Empty operator directory

- **WHEN** the deployment is bootstrapped and started without any operator-supplied font
- **THEN** the operator-owned directory exists and is empty, DocumentServer starts, and the editor offers the shipped CJK fonts

### Requirement: Always part of the deployment

The DocumentServer service, the proxy's second listener and its published port SHALL be part of every deployment of this overlay, whether the Office editing flag is on or off, so that the deployment has one shape: one set of compose services, two proxy listeners and seven images. The Office editing flag SHALL only decide whether WebUI offers editing; it SHALL NOT add or remove the service, the listener or the port. The deployment entry's preflight SHALL check each of these settings before any service starts: the DocumentServer image reference, the JWT secret, DocumentServer's control-plane address, its browser-facing origin, OCU's own control-plane address, the second proxy port and the operator-owned font directory, under the names the requirement "Setting names shared across components" fixes, and the release font directory, which is not a stored setting and is checked through the font check of `ocu-offline-image-delivery`. When any one of them is missing, empty or invalid, the deployment entry SHALL fail naming that setting without printing any credential value.

#### Scenario: Office editing flag off

- **WHEN** the deployment starts with the Office editing flag off
- **THEN** the DocumentServer container is running, the second listener answers a signed-in request, and WebUI offers no edit entry

#### Scenario: Missing required setting

- **WHEN** any one of the DocumentServer image reference, the JWT secret, DocumentServer's control-plane address, its browser-facing origin, OCU's own control-plane address, the second proxy port, the release font directory or the operator-owned font directory is missing, empty or invalid, with the Office editing flag on or off
- **THEN** the deployment entry's preflight exits nonzero naming that setting, before any service starts, and prints no credential value

### Requirement: Setting names shared across components

The settings that cross a component boundary SHALL have exactly these names wherever they are set and read:

| Name                          | Set by                                                   | Read by                                   | Meaning                                                                    |
| ----------------------------- | -------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| `OCU_OFFICE_DOCSERVER_URL`    | bootstrap                                                | OCU server; the proxy compose service     | DocumentServer's control-plane address; setting it enables Office editing  |
| `OCU_OFFICE_DOCSERVER_ORIGIN` | bootstrap                                                | OCU server                                | DocumentServer's browser-facing origin                                     |
| `OCU_OFFICE_SELF_URL`         | bootstrap                                                | OCU server                                | OCU's own control-plane address, used in the source and callback addresses |
| `OCU_OFFICE_JWT_SECRET`       | bootstrap                                                | OCU server; DocumentServer's JWT settings | the JWT secret generated at bootstrap                                      |
| `OCU_OFFICE_PROXY_PORT`       | bootstrap                                                | proxy compose service, port guard, smoke  | the second published proxy port                                            |
| `OCU_OFFICE_FONTS_DIR`        | bootstrap                                                | compose                                   | the operator-owned font directory                                          |
| `ENABLE_OCU_OFFICE_EDIT`      | bootstrap                                                | WebUI, through its compose service        | the Office editing flag                                                    |
| `DOCUMENTSERVER_IMAGE`        | the release assignments, from the release inventory      | compose, release verification             | the DocumentServer image reference                                         |
| `OCU_RELEASE_FONTS_DIR`       | the deployment entry, derived at every start; not stored | compose                                   | the release font directory                                                 |
| `OCU_OFFICE_PROXY_LISTEN`     | the proxy compose service; the WebUI smoke harness       | proxy renderer                            | the listen address of the DocumentServer listener                          |
| `OCU_OFFICE_PROXY_UPSTREAM`   | the proxy compose service; the WebUI smoke harness       | proxy renderer                            | the DocumentServer upstream of that listener                               |

The OCU server's configuration module SHALL define the four names it reads as constants, and the deploy tests SHALL compare the environment of the OCU service in the resolved compose configuration against those constants, so that a renamed setting on either side fails a test instead of leaving Office editing silently disabled. Once `OCU_OFFICE_DOCSERVER_URL` is set the other three SHALL be required by the OCU server (`ocu-auth-guard`). The broker's tuning values (free-space floor, ticket lifetime, liveness interval, save timeout) SHALL have defaults in the OCU configuration module and are not part of this list.

#### Scenario: Compose passes the names OCU reads

- **WHEN** the resolved compose configuration of the OCU service is compared with the name constants of the OCU configuration module
- **THEN** each of `OCU_OFFICE_DOCSERVER_URL`, `OCU_OFFICE_DOCSERVER_ORIGIN`, `OCU_OFFICE_SELF_URL` and `OCU_OFFICE_JWT_SECRET` is present in the service's environment with a non-empty value
- **AND** renaming one of them in the compose file or in the configuration module makes the comparison fail

#### Scenario: Bootstrap emits every name

- **WHEN** bootstrap has written its outputs
- **THEN** they hold a value for every name the table marks as set by bootstrap, with the Office editing flag on or off, and no value for `OCU_RELEASE_FONTS_DIR`

### Requirement: Acceptance-machine profile and recorded deviation

On the acceptance machine (4 vCPU, 7.4 GiB RAM, 33 GiB disk) the acceptance run SHALL keep at most one sandbox running at a time. That limit is an operating constraint of the run: OCU has no setting that limits concurrent sandboxes and this change SHALL NOT add one. The machine is below DocumentServer's official minimum; the deviation SHALL be recorded with the official minimum, the measured headroom and the one-sandbox constraint side by side. Whether swap is configured is the operator's choice at deployment: the B1 verification record SHALL state the memory and swap actually present on the machine, and no amount of swap SHALL be a precondition of the run. The profile SHALL be described as an acceptance environment and SHALL NOT be presented as a capacity statement.

#### Scenario: Memory and swap are recorded, not gated

- **WHEN** the B1 verification record is read
- **THEN** it states the memory and the swap actually present on the acceptance machine, including the case of no swap
- **AND** the acceptance run is neither refused nor marked failed because of the amount of swap

#### Scenario: Deviation record

- **WHEN** the B1 verification record is read
- **THEN** it lists DocumentServer's official minimum next to the figures measured on the acceptance machine, marks the machine as below that minimum, and states that the run kept at most one sandbox running
