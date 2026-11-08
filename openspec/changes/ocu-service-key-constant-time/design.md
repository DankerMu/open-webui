## Design

Change surface:

- OCU `computer-use-server/app.py`, the two comparisons (`:294` in `verify_mcp_auth`, `:1700` in `/api/skill-stats`);
- a new test module `tests/test_service_key_compare.py`, or new cases in `tests/test_auth_guard.py` if that module already builds the app the way the cases need (`tests/test_auth_guard.py:140-170`, `:215-225`).

Must preserve:

- `verify_mcp_auth`:
  - no `MCP_API_KEY` configured → returns `None` (no auth);
  - missing credentials → 401 `Missing Authorization header`;
  - wrong key → 401 `Invalid API key`;
  - correct key → passes.
  - Status codes, details and the `WWW-Authenticate: Bearer` header stay as they are.
- `/api/skill-stats`:
  - empty `MCP_TOKENS_API_KEY` → no check;
  - configured key with a missing or wrong `X-Internal-Api-Key` → 403 `Forbidden`;
  - correct key → the stats body.
- `auth_guard._credential_matches` and every other caller of it are unchanged.

Must change:

- `verify_mcp_auth` rejects when `not _credential_matches(credentials.credentials, MCP_API_KEY)`.
- `/api/skill-stats` rejects when `api_key and not _credential_matches(x_internal_api_key or "", api_key)`.
- A header value with a non-latin-1 character, such as `X-Internal-Api-Key: ключ` or a bearer `ключ`, is a rejection (403 or 401), never a 500.

Governing invariant: a configured service key is compared only through `_credential_matches`, and the result of every comparison is the same as before the change. Only timing and the non-latin-1 handling differ.

Seams under test:

- the FastAPI app, through `TestClient`, as `tests/test_auth_guard.py` builds it;
- `auth_guard._credential_matches`, monkeypatched on the module object that `app.py` uses, to count calls.

Required evidence (task 1.1). Run with the OCU unit command (`AGENTS.md:35`).

- **Red before, green after:**
  - (a) With `MCP_TOKENS_API_KEY=k1`, a GET to `/api/skill-stats` with `X-Internal-Api-Key: k1` calls `_credential_matches` exactly once with `("k1", "k1")`. A wrapper monkeypatched in records the call and delegates to the real function. Stub `_harvest_and_get_stats` so the route returns at once.
  - (b) With `MCP_API_KEY=k2`, a call to `/mcp-info` with `Authorization: Bearer k2` calls `_credential_matches` exactly once with `("k2", "k2")`.
- **Pass before and after (status contract):**
  - (c) `/api/skill-stats` with key `k1`:
    - missing header → 403;
    - `X-Internal-Api-Key: wrong` → 403;
    - `k1` → 200;
    - empty `MCP_TOKENS_API_KEY` and no header → 200.
  - (d) `/mcp-info` with key `k2`:
    - no `Authorization` → 401 `Missing Authorization header`;
    - `Bearer wrong` → 401 `Invalid API key`;
    - `Bearer k2` → 200.
  - (e) Non-latin-1 header values give 403 for `/api/skill-stats` and 401 for `/mcp-info`, never 500. Starlette decodes header bytes as latin-1, so build the value from UTF-8 bytes sent raw.
  - If `/mcp-info` or `/api/skill-stats` sit behind `auth_guard` middleware in the test app, give the test client a peer address and headers the guard admits, as the existing auth-guard tests do. Assert the route's own status, not the guard's.
- The full OCU unit command passes; report its counts.

Non-goals:

- the fail-open semantics when a key is unset;
- deleting either route;
- `/mcp` (already `bearer_matches`);
- `office/tokens.py` (already `compare_digest`).

Review focus:

- the red cases fail on `main` for the right reason, because `_credential_matches` is never called there;
- the monkeypatch targets the binding `app.py` actually calls (`auth_guard._credential_matches` via the module, or a name imported into `app`). The implementation must call it so that the patch is observable.
