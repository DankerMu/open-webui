# Unlisted identity/internal/health/MCP/docs paths and methods get 404, and no
# request in this file contacts OCU. The uploaded-skill registry block at the end
# adds a direct WebUI 401 control and a user-route 200, which are not denials.

GET {{proxy_url}}/ocu
Cookie: {{owner_cookie}}

HTTP 404

GET {{proxy_url}}/ocu/
Cookie: {{owner_cookie}}

HTTP 404

GET {{proxy_url}}/ocu/health
Cookie: {{owner_cookie}}

HTTP 404

GET {{proxy_url}}/ocu/docs
Cookie: {{owner_cookie}}

HTTP 404

GET {{proxy_url}}/ocu/mcp
Cookie: {{owner_cookie}}

HTTP 404

GET {{proxy_url}}/ocu/mcp-info
Cookie: {{owner_cookie}}

HTTP 404

GET {{proxy_url}}/ocu/system-prompt
Cookie: {{owner_cookie}}

HTTP 404

GET {{proxy_url}}/ocu/skill-list
Cookie: {{owner_cookie}}

HTTP 404

GET {{proxy_url}}/ocu/skill-mounts
Cookie: {{owner_cookie}}

HTTP 404

GET {{proxy_url}}/ocu/api/runtime/cli
Cookie: {{owner_cookie}}

HTTP 404

GET {{proxy_url}}/ocu/internal/launch/{{chat_id}}
Cookie: {{owner_cookie}}

HTTP 404

GET {{proxy_url}}/ocu/internal/describe/{{chat_id}}
Cookie: {{owner_cookie}}

HTTP 404

DELETE {{proxy_url}}/ocu/internal/sandbox/{{chat_id}}
Cookie: {{owner_cookie}}
X-Requested-With: ocu-workspace
Origin: {{origin}}

HTTP 404

GET {{proxy_url}}/_ocu_chat_auth
Cookie: {{owner_cookie}}

HTTP 404

GET {{proxy_url}}/_ocu_session_auth
Cookie: {{owner_cookie}}

HTTP 404

GET {{proxy_url}}/ocu/files/{{chat_id}}/a%2fb
Cookie: {{owner_cookie}}

HTTP 404

GET {{proxy_url}}/ocu/files/{{chat_id}}/%2e%2e/secret
Cookie: {{owner_cookie}}

HTTP 404

GET {{proxy_url}}/ocu/terminal/{{chat_id}}/wrong
Cookie: {{owner_cookie}}

HTTP 404

DELETE {{proxy_url}}/ocu/api/outputs/{{chat_id}}
Cookie: {{owner_cookie}}
X-Requested-With: ocu-workspace
Origin: {{origin}}

HTTP 404

OPTIONS {{proxy_url}}/ocu/static/preview.js
Cookie: {{owner_cookie}}

HTTP 404

POST {{proxy_url}}/ocu/files/{{chat_id}}/report.html
Cookie: {{owner_cookie}}
X-Requested-With: ocu-workspace
Origin: {{origin}}

HTTP 404

# Uploaded-skill registry: the gateway answers every /api/v1/ocu/skills/api/internal/
# path with its own 404, so a browser never reaches WebUI's internal key check.
# The key is a fixed wrong literal: nginx decides before reading any header.

# Control: the internal route is mounted in WebUI and refuses the wrong key itself.
GET {{webui_url}}/api/v1/ocu/skills/api/internal/user-config/x@y.z
X-Internal-Api-Key: smoke-wrong-key

HTTP 401

GET {{proxy_url}}/api/v1/ocu/skills/api/internal/user-config/x@y.z
X-Internal-Api-Key: smoke-wrong-key

HTTP 404
[Asserts]
body contains "<center>nginx</center>"

GET {{proxy_url}}/api/v1/ocu/skills/api/internal/skills/a/download
X-Internal-Api-Key: smoke-wrong-key

HTTP 404
[Asserts]
body contains "<center>nginx</center>"

# The user route under the same prefix still reaches WebUI.
GET {{proxy_url}}/api/v1/ocu/skills/
Cookie: {{owner_cookie}}

HTTP 200
[Asserts]
jsonpath "$" isCollection
