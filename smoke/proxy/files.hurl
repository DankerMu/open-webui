# Adversarial CSP/nosniff, binary/download preserve, D19 relative 401, encoded files.

GET {{proxy_url}}/ocu/files/{{chat_id}}/page.html?download=1&%64ownload=0
Cookie: {{owner_cookie}}

HTTP 302
[Asserts]
body == ""
header "Location" matches "^/ocu/f/[^/?#]+/{{chat_id}}/page[.]html[?]download=1&%64ownload=0$"
header "Cache-Control" == "no-store"
header "Referrer-Policy" == "no-referrer"

GET {{proxy_url}}{{resource_base}}/page.html

HTTP 200
[Asserts]
header "Content-Security-Policy" == "sandbox allow-scripts allow-forms"
header "X-Content-Type-Options" == "nosniff"
body not contains "default-src"
body contains "ocu-stub page"

GET {{proxy_url}}{{resource_base}}/diagram.svg

HTTP 200
[Asserts]
header "Content-Security-Policy" == "sandbox allow-scripts allow-forms"
header "X-Content-Type-Options" == "nosniff"
header "Content-Type" contains "svg"

GET {{proxy_url}}{{resource_base}}/data.xml

HTTP 200
[Asserts]
header "Content-Security-Policy" == "sandbox allow-scripts allow-forms"
header "X-Content-Type-Options" == "nosniff"

GET {{proxy_url}}{{resource_base}}/page.xhtml

HTTP 200
[Asserts]
header "Content-Security-Policy" == "sandbox allow-scripts allow-forms"
header "X-Content-Type-Options" == "nosniff"

GET {{proxy_url}}{{resource_base}}/blob.bin

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


GET {{proxy_url}}{{resource_base}}/page.html?Download=1

HTTP 200
[Asserts]
header "Content-Security-Policy" == "sandbox allow-scripts allow-forms"
header "X-Content-Type-Options" == "nosniff"

GET {{proxy_url}}{{resource_base}}/page.html?download=1&download=1

HTTP 200
[Asserts]
header "Content-Security-Policy" == "sandbox allow-scripts allow-forms"

GET {{proxy_url}}/ocu/files/{{chat_id}}/blob.bin?download=1
Cookie: {{owner_cookie}}

HTTP 200
[Asserts]
header "Content-Disposition" contains "attachment"
header "Content-Security-Policy" == "default-src 'self'"
header "X-Content-Type-Options" == "other"

GET {{proxy_url}}{{resource_base}}/plain.xml

HTTP 200
[Asserts]
header "Content-Security-Policy" == "sandbox allow-scripts allow-forms"
header "X-Content-Type-Options" == "nosniff"
body contains "plain-xml"

GET {{proxy_url}}{{resource_base}}/backend-html403.html

HTTP 403
[Asserts]
header "Content-Security-Policy" == "sandbox allow-scripts allow-forms"
header "X-Content-Type-Options" == "nosniff"

GET {{proxy_url}}/ocu/files/{{chat_id}}/style.css

HTTP 401
[Asserts]
header "X-Echo-Authorization" not exists

GET {{proxy_url}}{{resource_base}}/backend403

HTTP 403
[Asserts]
header "X-Echo-Authorization" not exists

GET {{proxy_url}}{{resource_base}}/backend409

HTTP 409
[Asserts]
header "X-Echo-Authorization" not exists
