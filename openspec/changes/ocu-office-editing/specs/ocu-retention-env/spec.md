# Spec Delta

## ADDED Requirements

### Requirement: DocumentServer settings provisioning

Bootstrap SHALL always provision the settings that the DocumentServer service and Office editing consume: a freshly generated DocumentServer JWT secret; the second proxy port; DocumentServer's control-plane address and its browser-facing origin; the release font directory and the operator-owned font directory. It SHALL write the WebUI Office editing flag (`ENABLE_OCU_OFFICE_EDIT`) from one operator input; that input SHALL change nothing else in the generated configuration. OCU has no separate Office switch: it is enabled by the DocumentServer address that bootstrap always provisions. The DocumentServer image reference SHALL be taken from the release inventory like the other image references. The JWT secret SHALL be written only to the mode 0600 runtime output, SHALL reach OCU and DocumentServer as the same value, and SHALL NOT appear in logs or deployment version reports. The existing refusal to overwrite existing outputs SHALL apply unchanged, so an existing secret is never regenerated or replaced. Bootstrap SHALL create the operator-owned font directory when it does not exist and SHALL NOT add, replace or remove fonts in it.

#### Scenario: Bootstrap with the Office editing flag on

- **WHEN** the operator supplies valid inputs with the Office editing flag on
- **THEN** the generated configuration satisfies deployment preflight and delivers one generated JWT secret to both OCU and DocumentServer
- **AND** it carries the second proxy port, DocumentServer's control-plane address and browser-facing origin, both font directories, and `ENABLE_OCU_OFFICE_EDIT` enabled for WebUI

#### Scenario: Bootstrap with the Office editing flag off

- **WHEN** the operator supplies valid inputs with the Office editing flag off
- **THEN** the generated configuration has exactly the same set of keys as the flag-on configuration, and every value that bootstrap does not generate per run is identical in both except `ENABLE_OCU_OFFICE_EDIT`
- **AND** the values generated per run, the secrets, are present and non-empty in both and are not compared, because two bootstrap runs generate different secrets
- **AND** the configuration satisfies deployment preflight

#### Scenario: Existing outputs keep their secret

- **WHEN** either output already exists
- **THEN** bootstrap refuses, preserves both files and generates no new JWT secret

#### Scenario: Secret not disclosed

- **WHEN** bootstrap output, deployment logs and the deployment version report are inspected
- **THEN** none contains the JWT secret, and the runtime output holding it has mode 0600

#### Scenario: Operator font directory

- **WHEN** bootstrap runs and the operator-owned font directory already holds fonts
- **THEN** the directory and its contents are unchanged and its path is carried in the generated configuration

### Requirement: Office configuration consistency

Bootstrap SHALL reject, without publishing either output, a configuration in which the DocumentServer image reference is absent or empty, one in which the JWT secret could not be generated, and one in which the browser-facing DocumentServer origin equals the WebUI origin. The browser-facing DocumentServer origin SHALL pass the same absolute-origin validation as the WebUI origin. The Office editing flag input SHALL accept only an explicit true or false; any other value SHALL be rejected rather than treated as off.

#### Scenario: No DocumentServer image reference

- **WHEN** the release inventory or the supplied image inputs give no DocumentServer image reference
- **THEN** bootstrap fails nonzero naming the missing input without publishing configuration or admin credentials

#### Scenario: Secret generation fails

- **WHEN** the JWT secret that would be written is absent or empty because generation failed
- **THEN** bootstrap fails nonzero without publishing either output or logging any credential value

#### Scenario: DocumentServer origin equals the WebUI origin

- **WHEN** the browser-facing DocumentServer origin has the same scheme, host and port as the WebUI origin
- **THEN** bootstrap fails nonzero without publishing either output

#### Scenario: Invalid Office editing input

- **WHEN** the Office editing flag input is neither true nor false, or the DocumentServer origin carries a path, credentials, query, fragment or trailing slash
- **THEN** bootstrap fails nonzero naming the input without publishing either output
