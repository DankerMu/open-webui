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

- `app.py:34` gains `_credential_matches` in its existing `from auth_guard import …` line. There is no separate `import auth_guard`.
- `verify_mcp_auth` rejects when `not _credential_matches(credentials.credentials, MCP_API_KEY)`.
- `/api/skill-stats` rejects when `api_key and not _credential_matches(x_internal_api_key or "", api_key)`.

Also preserved: a header value outside ASCII is rejected the same way before and after. Starlette decodes header bytes as latin-1, so `_credential_matches` can always encode them, and `!=` already rejected them. Only the comparison's timing changes.

Governing invariant: a configured service key is compared only through `_credential_matches`, and every comparison gives the same result as before.

Seams under test:

- The FastAPI app, through `TestClient`, loaded by the `app_module` and `client` fixtures in `tests/test_auth_guard.py` (`:130-170`, `:215-225`).
- `AuthGuardMiddleware` lets both routes through untouched:
  - they are not in `_GUARDED_PREFIXES` or `_IDENTITY_PATHS` (`auth_guard.py:31-41`), nor among the Office prefixes;
  - the `testclient` peer is not denied (`_peer_host` returns None, `auth_guard.py:145`).

  So no extra headers are needed, and the middleware itself never calls `_credential_matches`.

- Key values:
  - `MCP_API_KEY` is read once at import (`app.py:242`). Tests set it with `monkeypatch.setattr(app_module, "MCP_API_KEY", …)`, never `setenv`.
  - `MCP_TOKENS_API_KEY` is read per request (`app.py:1699`). Tests set it with `monkeypatch.setenv`.
- The comparison is observed by patching the name `app.py` calls: `monkeypatch.setattr(app_module, "_credential_matches", wrapper, raising=False)`.
  - `raising=False` because on `main` the name does not exist in `app`.
  - The wrapper records the arguments and delegates to `sys.modules["auth_guard"]._credential_matches`, the module loaded inside the fixture, not a top-level import.
- `_harvest_and_get_stats` is stubbed with `monkeypatch.setattr(app_module, "_harvest_and_get_stats", lambda: {"stub": True})`.

Required evidence (task 1.1). Run with the OCU unit command (`AGENTS.md:35`).

- **Red before, green after:**
  - (a) With `MCP_TOKENS_API_KEY=k1`, a GET to `/api/skill-stats` with `X-Internal-Api-Key: k1` answers 200, and the wrapper records exactly one call, `("k1", "k1")`. On `main` it records none.
  - (b) With `app_module.MCP_API_KEY = "k2"`, a GET to `/mcp-info` with `Authorization: Bearer k2` answers 200, and the wrapper records exactly one call, `("k2", "k2")`. On `main` it records none.
- **Pass before and after (status contract):**
  - (c) `/api/skill-stats` with `MCP_TOKENS_API_KEY=k1`:
    - missing header → 403 `Forbidden`;
    - `wrong` → 403;
    - `k1` → 200.

    With `MCP_TOKENS_API_KEY` empty and no header → 200.

  - (d) `/mcp-info` with `MCP_API_KEY = "k2"`:
    - no `Authorization` → 401 `Missing Authorization header`;
    - `Bearer wrong` → 401 `Invalid API key`;
    - both 401s carry `WWW-Authenticate: Bearer`;
    - `Bearer k2` → 200.

    With `MCP_API_KEY = None` and no header → 200.

  - (e) Header values outside ASCII, sent as raw UTF-8 bytes (`"ключ".encode()`; httpx rejects a non-ASCII `str`), give 403 for `/api/skill-stats` and 401 for `/mcp-info`.
  - (f) With `MCP_TOKENS_API_KEY="ключ"`, a request carrying that key's UTF-8 bytes gives 403. The configured key cannot be latin-1 encoded, which exercises the `UnicodeEncodeError` branch after the fix. `!=` also rejects it on `main`.

- The full OCU unit command passes; report its counts.

Non-goals:

- the fail-open semantics when a key is unset;
- deleting either route;
- `/mcp` (already `bearer_matches`);
- `office/tokens.py` (already `compare_digest`).

Review focus:

- the red cases fail on `main` for the right reason, because `_credential_matches` is never called there;
- the monkeypatch targets `app._credential_matches`, the name the from-import adds.
