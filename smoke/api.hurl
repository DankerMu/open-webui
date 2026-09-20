# smoke/api.hurl — key API routes (Q7.2). Keep in sync with AGENTS.md
# ## Verification Matrix and constraints.yaml `verification`.
# Needs the seeded harness admin (scripts/seed.sh): seed_email / seed_password
# are hurl variables injected by `make smoke`.

GET {{base_url}}/api/config

HTTP 200
[Asserts]
jsonpath "$.name" exists
jsonpath "$.version" exists

GET {{base_url}}/api/version

HTTP 200
[Asserts]
jsonpath "$.version" exists

POST {{base_url}}/api/v1/auths/signin
Content-Type: application/json
{
  "email": "{{seed_email}}",
  "password": "{{seed_password}}"
}

HTTP 200
[Captures]
token: jsonpath "$.token"
[Asserts]
jsonpath "$.role" == "admin"

GET {{base_url}}/api/models
Authorization: Bearer {{token}}

HTTP 200
[Asserts]
jsonpath "$.data" exists

GET {{base_url}}/api/v1/chats/
Authorization: Bearer {{token}}

HTTP 200
[Asserts]
jsonpath "$" isCollection

# Pending (Plan 1, docs/plans/2026-09-20-workspace-artifact-integration.md):
# GET {{base_url}}/api/v1/ocu/workspaces/{chat_id} and GET /api/v1/ocu/auth —
# add assertions here in the PR that implements them; do not add before.
