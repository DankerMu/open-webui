# Spec Delta

## ADDED Requirements

### Requirement: Internal skill registry path not exposed

The browser gateway SHALL answer 404 to every method on paths under `/api/v1/ocu/skills/api/internal/`, with or without cookies or an `X-Internal-Api-Key` header, and SHALL NOT forward such requests to WebUI. Other `/api/v1/ocu/skills` paths SHALL keep reaching WebUI as before.

#### Scenario: Internal path denied
- **WHEN** a browser client sends `GET /api/v1/ocu/skills/api/internal/user-config/a@b.c` through the gateway with a valid key header
- **THEN** the gateway returns 404 and WebUI receives no request

#### Scenario: User path still forwarded
- **WHEN** a signed-in user sends `GET /api/v1/ocu/skills/` through the gateway
- **THEN** the request reaches WebUI and returns its response
