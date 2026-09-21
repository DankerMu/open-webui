# smoke/ocu-auth-anon.hurl — anonymous GET /api/v1/ocu/auth (no signin).
# Own file: hurl cookie store is per file; `make smoke` does not pass
# --no-cookie-store, so a same-file GET after signin would be 200.

GET {{base_url}}/api/v1/ocu/auth
X-Chat-Id: smoke-anon

HTTP 401
[Asserts]
body == ""
