## MODIFIED Requirements

### Requirement: Published service addressing without compose fallback

CDP and ttyd service resolution SHALL use published host address and assigned host port, with no compose-network discovery, direct-container-IP fallback or network mutation. Concrete gateway bindings SHALL resolve to gateway plus published port. Existing host-network/shared-namespace loopback parsing SHALL remain supported as address parsing, not as an exception to managed-launch isolation. A host port of `0` SHALL count as unassigned. When a running sandbox's immutable port bindings request the service port but the engine assigned no host port for it, resolution SHALL raise a typed capability fault (status 503, reason `gateway_publication_unassigned`) naming the service port and the requested host address, instead of reporting the sandbox unavailable; the browser and terminal status routes SHALL answer `active: false` with that reason and detail, the CDP JSON routes SHALL answer 503 in the lifecycle-error body shape (`detail` and `reason`), and the WebSocket proxies SHALL keep closing with the backend-failure code. The fault SHALL NOT stop, mutate or re-own the sandbox and SHALL NOT introduce any loopback, wildcard, compose-network or container-IP fallback.

#### Scenario: Gateway publication

- **WHEN** a running sandbox reports a concrete gateway binding for CDP or ttyd
- **THEN** resolution returns that gateway and assigned host port, not the container port or container IP

#### Scenario: Missing publication

- **WHEN** a non-host-network sandbox has no immutable binding and no published mapping for the requested service
- **THEN** resolution reports unavailable even when a compose or sandbox container IP exists

#### Scenario: Requested publication never assigned

- **WHEN** a running sandbox's immutable bindings request the service port on the gateway and the engine's port mapping for it is absent, empty, or carries host port `0`
- **THEN** resolution raises the capability fault with status 503, reason `gateway_publication_unassigned`, and a message naming the service port and the gateway
- **AND** the sandbox keeps running with no stop, start, unpause or network mutation, and a stopped, absent or unbound sandbox still resolves as unavailable

#### Scenario: Routes surface the fault

- **WHEN** an authorized client calls the browser or terminal status route for such a sandbox
- **THEN** the response is `active: false` with `reason: gateway_publication_unassigned` and the fault message as `detail`, not a stopped, missing or metadata-only report
- **WHEN** an authorized client calls a CDP JSON route for such a sandbox
- **THEN** the response is 503 whose body `detail` carries the fault message as `detail` and `gateway_publication_unassigned` as `reason`, not 404
- **WHEN** the CDP or ttyd WebSocket lookup raises the fault
- **THEN** the proxy closes with the backend-failure code as for any lookup exception

#### Scenario: Engine qualification is recorded

- **WHEN** the opt-in engine qualification test publishes both sandbox service ports on a temporary bridge gateway through the production publication shape and resolves them through the production lookup against the real engine
- **THEN** it asserts per port that the resolution verdict matches the engine's own port mapping and that the immutable binding carries the gateway, records engine version, host platform, image store, image platform and the observation, and force-removes the container and network it created
