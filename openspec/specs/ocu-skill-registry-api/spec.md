# ocu-skill-registry-api Specification

## Purpose

Serve the external skill registry contract that OCU's skill manager already calls, so that OCU mounts exactly each user's enabled uploaded skills without any OCU server change.

## Requirements

### Requirement: Internal key authentication

The two registry endpoints SHALL accept a request only when its `X-Internal-Api-Key` header equals the configured `OCU_INTERNAL_TOKEN`, compared in constant time. They SHALL return 401 with an empty body in each of these cases: no header, a wrong value, or an empty or unset configured token. A browser session cookie or bearer token SHALL NOT grant access. When `ENABLE_OCU_WORKSPACE` is not `true`, both endpoints SHALL return 404.

#### Scenario: Cookie without key refused

- **WHEN** a request carries a valid administrator session cookie and no `X-Internal-Api-Key`
- **THEN** the response is 401

#### Scenario: Workspace disabled

- **WHEN** `ENABLE_OCU_WORKSPACE` is `false` and a request with the correct key calls either internal endpoint
- **THEN** each response is 404

#### Scenario: Empty configured token refuses everything

- **WHEN** `OCU_INTERNAL_TOKEN` is empty and a request sends `X-Internal-Api-Key:` with an empty value
- **THEN** the response is 401

### Requirement: Per-user enabled list in OCU format

`GET /api/v1/ocu/skills/api/internal/user-config/{email}` SHALL return 200 with `{"email": <email>, "enabled_skills": [...]}`. The list SHALL hold one object `{"name", "description", "category": "user", "zip_sha256"}` for each skill in the enabled set (design.md Decision 6) of the user with that email, computed by the same query as that user's `GET /api/v1/ocu/skills/`, without loading the ZIP bytes. An email matching no user SHALL return 200 with an empty list.

#### Scenario: Enabled set

- **WHEN** user U holds read access to `a` and `b` and has disabled `b`
- **THEN** U's user-config lists only `a`, with its current SHA-256 and `category` `user`

#### Scenario: Administrator matches own list

- **WHEN** skill `a` is narrowed to group A, and administrator M is not in group A
- **THEN** `a` appears in M's user-config exactly when it appears in M's `GET /api/v1/ocu/skills/` (present with `BYPASS_ADMIN_ACCESS_CONTROL` on, absent with it off)

#### Scenario: Unknown email

- **WHEN** the email matches no user
- **THEN** the response is 200 with `enabled_skills: []`

### Requirement: ZIP download

`GET /api/v1/ocu/skills/api/internal/skills/{name}/download` SHALL return the ZIP bytes stored in `ocu_skill.data` of an existing skill with content type `application/zip`. The SHA-256 of the response body SHALL equal the `zip_sha256` advertised in user-config. An unknown name SHALL return 404.

#### Scenario: Bytes match advertised hash

- **WHEN** OCU downloads `a` after reading its `zip_sha256` from user-config
- **THEN** the body's SHA-256 equals that value

#### Scenario: Deleted skill

- **WHEN** a skill has been deleted
- **THEN** its download returns 404
