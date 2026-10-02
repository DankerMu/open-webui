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

DocumentServer SHALL run with JWT validation enabled for browser requests, for inbound server requests (inbox) and for its own outbound requests (outbox), all using one secret generated at bootstrap. The secret SHALL NOT appear in logs, in the deployment version record, or in anything delivered to a browser; the editor configuration delivered to a browser SHALL carry only a signature made with the secret, never the secret itself.

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

The release SHALL carry open-source CJK fonts in a directory mounted into DocumentServer. A second, operator-owned directory SHALL be mounted the same way for fonts supplied by the deploying organisation. DocumentServer SHALL load the fonts of both directories at start. Operator-supplied fonts SHALL NOT be contained in either repository or in the release package.

#### Scenario: Fonts available after start

- **WHEN** DocumentServer starts with the release font directory and an operator directory that holds a supplied font
- **THEN** the editor's font list offers the shipped CJK fonts and the supplied font

#### Scenario: Supplied font added later

- **WHEN** an operator places a font in the operator-owned directory and restarts DocumentServer
- **THEN** the font is available in the editor without rebuilding or re-importing any image

#### Scenario: Release package contents

- **WHEN** the repositories and a built release package are inspected
- **THEN** they contain the open-source CJK fonts and none of the operator-supplied fonts

### Requirement: Always part of the deployment

The DocumentServer service, the proxy's second listener and its published port SHALL be part of every deployment of this overlay, whether the Office editing flag is on or off, so that the deployment has one shape: one set of compose services, two proxy listeners and seven images. The Office editing flag SHALL only decide whether WebUI offers editing; it SHALL NOT add or remove the service, the listener or the port. The deployment entry SHALL verify, before starting any service, that the DocumentServer image reference, the JWT secret, DocumentServer's control-plane address and browser-facing origin, the second proxy port and both font directories are configured, and SHALL otherwise fail naming the missing or invalid setting without printing any credential value.

#### Scenario: Office editing flag off

- **WHEN** the deployment starts with the Office editing flag off
- **THEN** the DocumentServer container is running, the second listener answers a signed-in request, and WebUI offers no edit entry

#### Scenario: Missing required setting

- **WHEN** the JWT secret, the image reference, an address, the second proxy port or a font directory is missing or empty, with the Office editing flag on or off
- **THEN** the deployment entry exits nonzero naming the setting, starts no service and prints no credential value

### Requirement: Acceptance-machine profile and recorded deviation

The acceptance machine (4 vCPU, 7.4 GiB RAM, 33 GiB disk) SHALL run the deployment with 4 GB of swap active, and the acceptance run SHALL keep at most one sandbox running at a time. That limit is an operating constraint of the run: OCU has no setting that limits concurrent sandboxes and this change SHALL NOT add one. The machine is below DocumentServer's official minimum; the deviation SHALL be recorded with the official minimum, the measured headroom and the one-sandbox constraint side by side. The profile SHALL be described as an acceptance environment and SHALL NOT be presented as a capacity statement.

#### Scenario: Acceptance profile inspected

- **WHEN** the acceptance machine's host memory configuration is inspected before the run
- **THEN** 4 GB of swap is active

#### Scenario: Deviation record

- **WHEN** the release verification record is read
- **THEN** it lists DocumentServer's official minimum next to the figures measured on the acceptance machine, marks the machine as below that minimum, and states that the run kept at most one sandbox running
