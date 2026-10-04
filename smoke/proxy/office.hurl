# Entries run serially by the gateway judge, with a private arrival boundary per request.

POST {{proxy_url}}/ocu/api/office/{{office_chat}}/documents/{{office_file}}/sessions
Cookie: {{owner_cookie}}
Origin: {{origin}}
X-Requested-With: ocu-workspace
Content-Type: application/json
{}
HTTP 201
[Asserts]
jsonpath "$.file_id" == "{{office_file}}"
jsonpath "$.state" == "opening"
jsonpath "$.joined" == false

GET {{proxy_url}}/ocu/api/office/{{office_chat}}/sessions/{{office_session}}
Cookie: {{owner_cookie}}
HTTP 200
[Asserts]
jsonpath "$.session_id" == "{{office_session}}"
jsonpath "$.state" == "{{office_state}}"

POST {{proxy_url}}/ocu/api/office/{{office_chat}}/sessions/{{office_session}}/save
Cookie: {{owner_cookie}}
Origin: {{origin}}
X-Requested-With: ocu-workspace
Content-Type: application/json
{"intent":"publish"}
HTTP 202
[Asserts]
jsonpath "$.session_id" == "{{office_session}}"
jsonpath "$.save_seq" == 1
jsonpath "$.intent" == "publish"

POST {{proxy_url}}/ocu/api/office/{{office_chat}}/sessions/{{office_session}}/resolve
Cookie: {{owner_cookie}}
Origin: {{origin}}
X-Requested-With: ocu-workspace
Content-Type: application/json
{"action":"overwrite"}
HTTP 200
[Asserts]
jsonpath "$.state" == "editing"
jsonpath "$.file_id" == "{{office_file}}"
jsonpath "$.path" == "report.docx"

POST {{proxy_url}}/ocu/api/office/{{office_chat}}/sessions/{{office_session}}/close
Cookie: {{owner_cookie}}
Origin: {{origin}}
X-Requested-With: ocu-workspace
Content-Type: application/json
{}
HTTP 202
[Asserts]
jsonpath "$.session_id" == "{{office_session}}"
jsonpath "$.save_seq" == 2
jsonpath "$.state" == "closed"

GET {{proxy_url}}/ocu/api/office/{{office_chat}}/documents/{{office_file}}/versions
Cookie: {{owner_cookie}}
HTTP 200
[Asserts]
jsonpath "$.file_id" == "{{office_file}}"
jsonpath "$.open_session" == null
jsonpath "$.versions[1].source" == "save"
jsonpath "$.versions[1].published" == true
jsonpath "$.versions[2].source" == "close"

POST {{proxy_url}}/ocu/api/office/{{office_chat}}/documents/{{office_file}}/restore
Cookie: {{owner_cookie}}
Origin: {{origin}}
X-Requested-With: ocu-workspace
Content-Type: application/json
{"number":{{office_version}}}
HTTP 200
[Asserts]
jsonpath "$.file_id" == "{{office_file}}"
jsonpath "$.number" == 4
jsonpath "$.published" == true

# Denial entries address each row independently; status is judged by Hurl.
GET {{proxy_url}}{{office_path}}
Cookie: {{office_cookie}}
Origin: {{office_origin}}
X-Requested-With: ocu-workspace
HTTP *
[Asserts]
status == {{office_expected}}

POST {{proxy_url}}{{office_path}}
Cookie: {{office_cookie}}
Origin: {{office_origin}}
X-Requested-With: ocu-workspace
Content-Type: application/json
{}
HTTP *
[Asserts]
status == {{office_expected}}

POST {{proxy_url}}{{office_path}}
Cookie: {{owner_cookie}}
Origin: {{origin}}
Content-Type: application/json
{}
HTTP 403

GET {{proxy_url}}{{office_path}}
Cookie: {{owner_cookie}}
HTTP 200
[Asserts]
jsonpath "$.files[0].path" == "report.docx"
