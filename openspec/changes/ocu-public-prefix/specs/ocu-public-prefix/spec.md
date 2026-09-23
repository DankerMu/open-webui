## Purpose

Keep preview shell assets and browser viewer requests on the intended OCU public path without changing default unprefixed behavior or WebUI-owned addresses.

## ADDED Requirements

### Requirement: Canonical public prefix configuration

OCU SHALL read OCU_PUBLIC_PREFIX with default empty. A nonempty prefix SHALL consist of slash-led nonempty ASCII path segments containing letters, digits, underscore, hyphen, dot or tilde; segments `.` and `..` are forbidden. Trailing slash, whitespace, percent encoding, query, fragment, scheme and protocol-relative values SHALL fail startup rather than be normalized.

#### Scenario: Invalid configuration

- **WHEN** OCU_PUBLIC_PREFIX is `ocu`, `/ocu/`, `//ocu`, `/../ocu` or `/ocu?x=1`
- **THEN** startup fails explicitly naming OCU_PUBLIC_PREFIX

### Requirement: Shell addresses and static mount

OCU SHALL emit shell stylesheet/script addresses, apiUrl, filesBase and inline heartbeat under the configured prefix exactly once. describeUrl SHALL equal `/api/v1/ocu/workspaces/{chat_id}` and SHALL remain unprefixed. Static assets SHALL be mounted only at `{prefix}/static/`. Empty prefix SHALL preserve every baseline-emitted URL; describeUrl is additive. The shell SHALL never expose the internal token, and preview authorization SHALL remain unchanged.

#### Scenario: Prefixed shell

- **WHEN** an authorized preview is requested with prefix `/ocu`
- **THEN** asset URLs start `/ocu/static/`, apiUrl is `/ocu/api/outputs/{chat_id}`, filesBase is `/ocu/files/{chat_id}`, heartbeat is `/ocu/terminal/{chat_id}/heartbeat`, and describeUrl remains `/api/v1/ocu/workspaces/{chat_id}`

#### Scenario: Static mount moves cleanly

- **WHEN** prefix `/ocu` is configured
- **THEN** `/ocu/static/preview.css` returns the stylesheet with its content type and `/static/preview.css` returns404

#### Scenario: Empty prefix compatibility

- **WHEN** OCU_PUBLIC_PREFIX is unset
- **THEN** all baseline shell URLs retain their exact values, `/static/preview.css` remains served and the added describeUrl is unprefixed

#### Scenario: Preview authorization preserved

- **WHEN** a preview request omits or supplies an invalid internal token
- **THEN** it returns401 before generating chat content

### Requirement: Browser viewer public addresses

Browser viewer discovery, tab polling and CDP WebSocket connect/reconnect SHALL derive their public path from the viewer module's URL, preserving the configured path prefix exactly once and using the current same-origin HTTP/WS protocol pairing. Empty prefix SHALL retain baseline browser addresses. Module import/fetch-wrapper cutover remains the separate issue17 contract.

#### Scenario: Prefixed browser viewer

- **WHEN** browser-viewer.js is served from `https://webui.example/tools/ocu/static/browser-viewer.js`
- **THEN** discovery/polling use `/tools/ocu/browser/{chat_id}/json` and connect/reconnect use `wss://webui.example/tools/ocu/browser/{chat_id}/devtools/page/{page_id}` without double prefix

#### Scenario: Default browser viewer

- **WHEN** browser-viewer.js is served from `http://ocu.example/static/browser-viewer.js`
- **THEN** browser discovery remains `/browser/{chat_id}/json` and WebSocket addresses remain `ws://ocu.example/browser/{chat_id}/devtools/page/{page_id}`
