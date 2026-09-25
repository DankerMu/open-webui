# Mutation 403 vs owner 404; legitimate SPA mutations succeed.

GET {{proxy_url}}/ocu/terminal/{{chat_id}}/heartbeat
Cookie: {{owner_cookie}}
Origin: null
X-Requested-With: ocu-workspace
Sec-Fetch-Site: same-origin

HTTP 403
[Asserts]
header "X-Echo-Authorization" not exists

GET {{proxy_url}}/ocu/terminal/{{chat_id}}/heartbeat
Cookie: {{owner_cookie}}
Origin: {{origin}}

HTTP 403

GET {{proxy_url}}/ocu/terminal/{{chat_id}}/sessions
Cookie: {{owner_cookie}}
Origin: {{origin}}
X-Requested-With: ocu-workspace

HTTP 200
[Asserts]
jsonpath "$.ok" == true

GET {{proxy_url}}/ocu/terminal/{{chat_id}}/processes
Cookie: {{owner_cookie}}
Sec-Fetch-Site: same-origin
X-Requested-With: ocu-workspace

HTTP 200

GET {{proxy_url}}/ocu/terminal/{{chat_id}}/heartbeat
Cookie: {{owner_cookie}}
Origin: {{origin}}
X-Requested-With: ocu-workspace

HTTP 200

POST {{proxy_url}}/ocu/terminal/{{chat_id}}/start-ttyd
Cookie: {{owner_cookie}}
Origin: {{origin}}
X-Requested-With: ocu-workspace
Content-Type: application/json

{"ok":true}

HTTP 200

GET {{proxy_url}}/ocu/terminal/{{chat_id}}/status
Cookie: {{owner_cookie}}

HTTP 200

POST {{proxy_url}}/ocu/terminal/{{chat_id}}/stop-ttyd
Cookie: {{owner_cookie}}
Origin: {{origin}}
X-Requested-With: ocu-workspace

HTTP 200

GET {{proxy_url}}/ocu/terminal/{{chat_id}}/heartbeat
Cookie: {{owner_cookie}}
Origin: {{origin}}
X-Requested-With: ocu-workspace

HTTP 200


GET {{proxy_url}}/ocu/preview/{{chat_id}}
Cookie: {{owner_cookie}}

HTTP 200
