# Listed chat/static/preview/browser/terminal routes and upload GET collisions.

GET {{proxy_url}}/ocu/preview/{{chat_id}}
Cookie: {{owner_cookie}}

HTTP 200
[Asserts]
body contains "/ocu/static/preview.js"
body contains "/ocu/api/outputs/"
body contains "/ocu/files/"
body contains "/api/v1/ocu/workspaces/"
header "X-Echo-Authorization" not exists

GET {{proxy_url}}/ocu/api/uploads/{{chat_id}}/manifest
Cookie: {{owner_cookie}}

HTTP 200
[Asserts]
jsonpath "$.kind" == "manifest"

GET {{proxy_url}}/ocu/api/uploads/{{chat_id}}/list
Cookie: {{owner_cookie}}

HTTP 200
[Asserts]
jsonpath "$.kind" == "list"

GET {{proxy_url}}/ocu/files/{{chat_id}}/archive
Cookie: {{owner_cookie}}

HTTP 200
[Asserts]
jsonpath "$.archive" == true

GET {{proxy_url}}/ocu/browser/{{chat_id}}/status
Cookie: {{owner_cookie}}

HTTP 200

GET {{proxy_url}}/ocu/browser/{{chat_id}}/json
Cookie: {{owner_cookie}}

HTTP 200

GET {{proxy_url}}/ocu/browser/{{chat_id}}/json/version
Cookie: {{owner_cookie}}

HTTP 200

GET {{proxy_url}}/ocu/terminal/{{chat_id}}/status
Cookie: {{owner_cookie}}

HTTP 200

