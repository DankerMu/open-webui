# Adversarial CSP/nosniff, binary/download preserve, D19 relative 401, encoded files.

GET {{proxy_url}}/ocu/files/{{chat_id}}/page.html
Cookie: {{owner_cookie}}

HTTP 200
[Asserts]
header "Content-Security-Policy" == "sandbox allow-scripts allow-forms"
header "X-Content-Type-Options" == "nosniff"
body not contains "default-src"
body contains "ocu-stub page"

GET {{proxy_url}}/ocu/files/{{chat_id}}/diagram.svg
Cookie: {{owner_cookie}}

HTTP 200
[Asserts]
header "Content-Security-Policy" == "sandbox allow-scripts allow-forms"
header "X-Content-Type-Options" == "nosniff"
header "Content-Type" contains "svg"

GET {{proxy_url}}/ocu/files/{{chat_id}}/data.xml
Cookie: {{owner_cookie}}

HTTP 200
[Asserts]
header "Content-Security-Policy" == "sandbox allow-scripts allow-forms"
header "X-Content-Type-Options" == "nosniff"

GET {{proxy_url}}/ocu/files/{{chat_id}}/page.xhtml
Cookie: {{owner_cookie}}

HTTP 200
[Asserts]
header "Content-Security-Policy" == "sandbox allow-scripts allow-forms"
header "X-Content-Type-Options" == "nosniff"

GET {{proxy_url}}/ocu/files/{{chat_id}}/blob.bin
Cookie: {{owner_cookie}}

HTTP 200
[Asserts]
header "Content-Security-Policy" == "default-src 'self'"
header "X-Content-Type-Options" == "other"
header "Content-Disposition" contains "inline"

GET {{proxy_url}}/ocu/files/{{chat_id}}/page.html?download=1
Cookie: {{owner_cookie}}

HTTP 200
[Asserts]
header "Content-Disposition" contains "attachment"
header "Content-Security-Policy" == "default-src 'self'"

GET {{proxy_url}}/ocu/files/{{chat_id}}/page.html?revision=7&download=1
Cookie: {{owner_cookie}}

HTTP 200
[Asserts]
header "Content-Disposition" contains "attachment"

GET {{proxy_url}}/ocu/files/{{chat_id}}/backend-html403.html
Cookie: {{owner_cookie}}

HTTP 403
[Asserts]
header "Content-Security-Policy" == "sandbox allow-scripts allow-forms"
header "X-Content-Type-Options" == "nosniff"

GET {{proxy_url}}/ocu/files/{{chat_id}}/style.css

HTTP 401
[Asserts]
header "X-Echo-Authorization" not exists
