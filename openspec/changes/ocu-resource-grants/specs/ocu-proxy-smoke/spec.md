## MODIFIED Requirements

### Requirement: Generated-content policy and credential containment

The matrix SHALL assert enforced CSP/nosniff on final generated HTML/SVG/XML responses, preserved binary/canonical-download policy, attachment disposition, prefixed preview resources and denial of cookie-less canonical file requests. It SHALL independently prove valid cookie-less grant resource access, canonical owner redirects, grant GET/HEAD, opaque-origin CORS, expiry, scope and header-forgery refusal. Every exercised browser response's headers/body and public diagnostics SHALL exclude the synthetic internal/session credentials; only the intentional issuer Location may contain a grant. Allowed requests SHALL independently prove correct upstream internal credential receipt and absence of forwarded grant/browser credentials. Denied requests SHALL prove no OCU contact. Public stub routes SHALL not echo credentials; existing internal fixture echo behavior MAY remain unproxied.

#### Scenario: Generated and downloaded file responses

- **WHEN** generated files, binary files and canonical download=1 fixtures are requested
- **THEN** each follows the approved gateway MIME/download policy without duplicate CSP, including the final grant response after a redirect

#### Scenario: Credential echo regression

- **WHEN** a controlled upstream fixture reflects the internal token in a browser response
- **THEN** the judge fails for containment without printing that token
- **WHEN** the corrected public fixture handles an allowed request
- **THEN** response containment and private correct-token receipt both pass

#### Scenario: Real grant admission and refusal matrix

- **WHEN** the smoke obtains a grant through the real WebUI issuer and exercises valid GET/HEAD/null-origin resources, forged headers, changed chat, archive/control paths, unsupported methods, tampering and expiration
- **THEN** valid requests reach only the matching ordinary file, invalid requests do not contact OCU, normal session rows retain401/404/403 semantics, and the grant cannot authenticate to WebUI APIs

#### Scenario: Expiry without a production clock bypass

- **WHEN** a grant is issued for a genuinely short-lived synthetic harness session and that session expires
- **THEN** the same grant is denied before OCU contact, no global session setting or production test clock is changed, and grant/cookie values appear neither in command argv nor public failure output

## ADDED Requirements

### Requirement: Pinned resource grant integration

The WebUI harness SHALL pin the reviewed OCU commit containing confined file HEAD transport, the preview resource-base correction and grant gateway support, and SHALL update its fixtures/expectations atomically with that pin. It SHALL supply already-required Office listener renderer inputs and retain existing Office gateway evidence, without claiming #172 real-editor acceptance. Native request evidence SHALL precede browser resource/isolation acceptance, which SHALL use the same pinned gateway.

#### Scenario: Complete pin and legacy gateway coverage

- **WHEN** make smoke-proxy runs with the resource-grant pin
- **THEN** its grant matrix and existing session/Office matrix both pass using the declared renderer inputs and exact OCU source; missing prerequisites fail rather than skip
