# Unlisted identity/internal/health/MCP/docs and methods: 404, no OCU contact.

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
