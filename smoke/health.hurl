# smoke/health.hurl — liveness probe. `base_url` is a hurl runtime variable
# injected by `make smoke` (--variable base_url=http://localhost:8080).
GET {{base_url}}/health

HTTP 200
[Asserts]
jsonpath "$.status" == true
