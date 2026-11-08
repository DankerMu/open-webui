## Why

Two routes in OCU's `computer-use-server/app.py` compare service keys with Python `!=` (#775):

- `/api/skill-stats` checks `X-Internal-Api-Key` against `MCP_TOKENS_API_KEY` (`:1699-1701`);
- `verify_mcp_auth`, used only by `/mcp-info` (`:1826`), checks the bearer token against `MCP_API_KEY` (`:294`).

`!=` returns early, so its time depends on how long a prefix matches. The same repository already compares credentials in constant time in `auth_guard._credential_matches` (`auth_guard.py:163-171`), and WebUI's `_internal_key_accepted` does too. Once DankerMu/open-computer-use#224 (#753) sets `MCP_TOKENS_API_KEY` from `OCU_INTERNAL_TOKEN`, `/api/skill-stats` compares a real secret. Only control-plane peers can reach either route, so this is hygiene, not a demonstrated vulnerability. Both `!=` come from the upstream initial commit `e5d2908`.

## What Changes

- Both comparisons call `auth_guard._credential_matches`, so there is one comparison implementation. Every result stays the same; only the timing changes.
- What happens when no key is configured is unchanged, out of scope per #775:
  - `/api/skill-stats` with an empty `MCP_TOKENS_API_KEY` still allows the request;
  - `verify_mcp_auth` with an empty `MCP_API_KEY` still returns `None`.

## Triage

```text
Issue type: bugfix (hygiene)
Fixture level: standard
Upstream suggested level: absent (follow-up issue)
Blast radius: two control-plane-only routes; a wrong change could lock out /mcp-info or /api/skill-stats callers or make them fail open
Selected risk packs: Auth / secrets; Legacy compatibility
Evidence floor: new pytest cases red before and green after; OCU unit command from its AGENTS.md passes
```

Repository: `DankerMu/open-computer-use`. As with every `[ocu]` issue, this fixture lives in the WebUI control plane.
