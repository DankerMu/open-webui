# Owner, anonymous, foreign, static session, identity overwrite, x-api-key 401.

GET {{proxy_url}}/ocu/api/outputs/{{chat_id}}
Cookie: {{owner_cookie}}
X-User-Id: forged-id
X-User-Email: forged@example.test
X-Chat-Id: other-chat
Authorization: Bearer user-controlled
X-OCU-Internal-Token: forged-token

HTTP 200
[Asserts]
jsonpath "$.files[0].url" startsWith "/ocu/files/"
header "X-Echo-Authorization" not exists
header "Authorization" not exists
body not contains "{{owner_jwt}}"

GET {{proxy_url}}/ocu/api/outputs/{{chat_id}}

HTTP 401
[Asserts]
header "X-Echo-Authorization" not exists

GET {{proxy_url}}/ocu/api/outputs/{{chat_id}}
Cookie: {{foreign_cookie}}

HTTP 404
[Asserts]
header "X-Echo-Authorization" not exists

GET {{proxy_url}}/ocu/static/preview.js

HTTP 401

GET {{proxy_url}}/ocu/static/preview.js
Cookie: {{foreign_cookie}}

HTTP 200
[Asserts]
header "Content-Type" contains "javascript"
header "X-Echo-Authorization" not exists
body not contains "Bearer "


GET {{proxy_url}}/ocu/files/{{chat_id}}/backend403
Cookie: {{owner_cookie}}

HTTP 403
[Asserts]
header "X-Echo-Authorization" not exists

GET {{proxy_url}}/ocu/files/{{chat_id}}/backend409
Cookie: {{owner_cookie}}

HTTP 409
[Asserts]
header "X-Echo-Authorization" not exists

GET {{proxy_url}}/ocu/static/deep/preview.js?rev=5
Cookie: {{owner_cookie}}

HTTP 200

[Asserts]
body contains "ocuStubDeep"

HEAD {{proxy_url}}/ocu/static/deep/preview.js
Cookie: {{owner_cookie}}

HTTP 200


GET {{proxy_url}}/ocu/api/outputs/{{chat_id}}
x-api-key: {{owner_jwt}}

HTTP 401

GET {{proxy_url}}/ocu/static/preview.js
x-api-key: {{owner_jwt}}

HTTP 401
