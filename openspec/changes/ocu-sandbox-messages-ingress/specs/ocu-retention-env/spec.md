## MODIFIED Requirements

### Requirement: Current deployment configuration

Bootstrap SHALL require an explicit source commit matching the selected checkout and explicit runtime image references instead of selecting historical source or upstream WebUI defaults. Generated configuration SHALL supply the existing proxy-only deployment entrypoint with distinct control and sandbox topology, correct sandbox gateway binding, consistent public origin/base, internal auth endpoint and shared internal token. OCU SHALL receive `OCU_PUBLIC_PREFIX=/ocu` and `OCU_SANDBOX_NO_AUTOSTART=1` through its effective service environment. The egress allowlist SHALL be explicit and use the existing IPv4/CIDR validation contract. Bootstrap SHALL write `OCU_SANDBOX_MESSAGES_ADDRESS` (default `172.31.0.254`) and refuse an allowlist that does not cover it.

#### Scenario: Bootstrap consumed by deployment

- **WHEN** the operator supplies valid source, image, origin and egress inputs
- **THEN** generated configuration satisfies deployment preflight and delivers the same internal token to WebUI, OCU and proxy
- **AND** `PUBLIC_BASE_URL` is the valid HTTP(S) origin without a trailing slash plus `/ocu`, and `OCU_WEBUI_AUTH_URL` is `http://open-webui:8080/api/v1/ocu/auth`
- **AND** OCU receives the prefix and no-autostart settings without a source patch

#### Scenario: Missing or conflicting input

- **WHEN** required input is absent, the source SHA differs, the allowlist is malformed, or the allowlist does not cover `OCU_SANDBOX_MESSAGES_ADDRESS`
- **THEN** bootstrap fails nonzero without publishing configuration or admin credentials

#### Scenario: Explicit deny-all

- **WHEN** the egress input is explicitly empty
- **THEN** bootstrap fails naming `OCU_SANDBOX_MESSAGES_ADDRESS` rather than substituting public access, omitting the setting or publishing configuration
