# smoke/ocu-skills.hurl — uploaded-skill upload/delete round trip as the seeded
# harness admin, with OCU's internal registry calls in between (AGENTS.md ## Verification Matrix,
# uploaded-skill round-trip and internal-registry rows). A rerun after an interrupted run is
# idempotent: re-uploading an existing name replaces it.
# fixtures/ocu-smoke-skill.zip (sha256 asserted below) was built from the repo root with:
#   python3 -c "import zipfile; i = zipfile.ZipInfo('SKILL.md', date_time=(1980, 1, 1, 0, 0, 0)); i.compress_type = zipfile.ZIP_DEFLATED; i.external_attr = 0o100644 << 16; z = zipfile.ZipFile('smoke/fixtures/ocu-smoke-skill.zip', 'w'); z.writestr(i, '---\nname: harness-smoke-skill\ndescription: Harness smoke skill, uploaded and deleted by make smoke.\n---\nNo instructions.\n'); z.close()"

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

POST {{base_url}}/api/v1/ocu/skills/upload
Authorization: Bearer {{token}}
Content-Type: application/zip
file,fixtures/ocu-smoke-skill.zip;

HTTP 200
[Asserts]
jsonpath "$.name" == "harness-smoke-skill"
jsonpath "$.zip_sha256" == "4cbbaee5495844a723348b26f257ac0627aff61b8508070e64c6e2bf5351291c"
jsonpath "$.size" == 210

GET {{base_url}}/api/v1/ocu/skills/admin
Authorization: Bearer {{token}}

HTTP 200
[Asserts]
# Hurl collapses a one-element filter result to that element.
jsonpath "$[?(@.name == 'harness-smoke-skill')].zip_sha256" == "4cbbaee5495844a723348b26f257ac0627aff61b8508070e64c6e2bf5351291c"
jsonpath "$[?(@.name == 'harness-smoke-skill')].access_grants" count == 1
jsonpath "$[?(@.name == 'harness-smoke-skill')].access_grants[0].principal_type" == "user"
jsonpath "$[?(@.name == 'harness-smoke-skill')].access_grants[0].principal_id" == "*"
jsonpath "$[?(@.name == 'harness-smoke-skill')].access_grants[0].permission" == "read"

GET {{base_url}}/api/v1/ocu/skills/api/internal/user-config/{{seed_email}}
X-Internal-Api-Key: {{ocu_internal_token}}

HTTP 200
[Asserts]
jsonpath "$.email" == "{{seed_email}}"
jsonpath "$.enabled_skills[?(@.name == 'harness-smoke-skill')].category" == "user"
jsonpath "$.enabled_skills[?(@.name == 'harness-smoke-skill')].zip_sha256" == "4cbbaee5495844a723348b26f257ac0627aff61b8508070e64c6e2bf5351291c"

GET {{base_url}}/api/v1/ocu/skills/api/internal/skills/harness-smoke-skill/download
X-Internal-Api-Key: {{ocu_internal_token}}

HTTP 200
[Asserts]
header "Content-Type" startsWith "application/zip"
sha256 == hex,4cbbaee5495844a723348b26f257ac0627aff61b8508070e64c6e2bf5351291c;

GET {{base_url}}/api/v1/ocu/skills/api/internal/user-config/{{seed_email}}

HTTP 401
[Asserts]
bytes count == 0

DELETE {{base_url}}/api/v1/ocu/skills/harness-smoke-skill
Authorization: Bearer {{token}}

HTTP 200
[Asserts]
jsonpath "$" == true

GET {{base_url}}/api/v1/ocu/skills/admin
Authorization: Bearer {{token}}

HTTP 200
[Asserts]
jsonpath "$[?(@.name == 'harness-smoke-skill')]" not exists

GET {{base_url}}/api/v1/ocu/skills/api/internal/skills/harness-smoke-skill/download
X-Internal-Api-Key: {{ocu_internal_token}}

HTTP 404
