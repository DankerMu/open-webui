# Proposal

## Why

OCU skills (folders with `SKILL.md` and scripts that run inside the sandbox) can only be added by rebuilding the OCU image. The optional `settings-wrapper` registry is a commented-out mock with no UI (`../open-computer-use/docker-compose.yml:91-99`). Administrators need to upload skills as ZIP files and choose who may use them. Users need to switch off uploaded skills they do not want and to name one explicitly with `/`. Source plan: `docs/plans/2026-11-07-ocu-uploaded-skills.md` (Decision Ledger confirmed by the user on 2026-11-07).

Triage:

```text
Issue type: feature
Fixture level: expanded
Upstream suggested level: absent
Blast radius: admin-uploaded code mounted into every granted user's sandbox; a wrong grant or validation check exposes or runs the wrong skill for the wrong user
Selected risk packs: Public API, Config, File IO / path safety, Schema, Auth / secrets, Resource limits, Error handling / partial outputs, Documentation
Evidence floor: backend pytest (router + validation + drift), make db-verify, make smoke, make verify-ui-ocu, OCU filter pytest, make smoke-proxy
```

## What Changes

- New Open WebUI table pair (`ocu_skill`, `ocu_skill_user_disable`). One additive Alembic migration, named in the source plan.
- New router `backend/open_webui/routers/ocu_skills.py`. It is registered only when `ENABLE_OCU_WORKSPACE=true` and provides:
  - administrator upload, replace, list, access update and hard delete;
  - a per-user list and a per-user toggle;
  - the two internal endpoints of OCU's existing external skill registry contract (`user-config/{email}`, `skills/{name}/download`), authenticated by `X-Internal-Api-Key` equal to `OCU_INTERNAL_TOKEN`.
- ZIP upload validation:
  - path traversal, symlink and encrypted-entry rejection;
  - limits of 50 MB compressed, 200 MB uncompressed and 2000 entries;
  - `SKILL.md` frontmatter `name` and `description`;
  - a hardcoded reserved list of built-in names, with a drift test against the pinned OCU checkout.
- A new upload is visible to everyone through a `user:*:read` access grant. Administrators narrow it with the existing access-control UI.
- UI:
  - an Admin Settings tab and a personal Settings tab, both named 「工作区 Skills」;
  - a 「工作区 Skills」 group in the `/` menu that inserts `</ocu--{name}|{name}>`.
- OCU repository (no `computer-use-server/` change):
  - the `computer_link_filter` inlet rewrites the marker and appends a named-skill instruction;
  - the deploy overlay sets `MCP_TOKENS_URL` and `MCP_TOKENS_API_KEY`;
  - the proxy returns 404 for the internal registry path.
- Native Open WebUI Skills are untouched.

## Capabilities

### New Capabilities

- `ocu-uploaded-skills`: administrator upload, replace, delete and access control of uploaded skills, ZIP validation, and reserved built-in names.
- `ocu-uploaded-skill-preferences`: a user's list of granted uploaded skills and their persistent per-user enable/disable state.
- `ocu-skill-registry-api`: internal endpoints that serve OCU's skill registry contract (per-user enabled list, ZIP download) under internal-key authentication.
- `ocu-uploaded-skill-ui`: the Admin Settings tab, the personal Settings tab and the `/` menu group, with marker insertion.
- `ocu-skill-mention`: OCU filter handling of the `/` marker. The marker becomes plain text, and the model gets a named-skill instruction.
- `ocu-skill-registry-deploy`: deploy overlay wiring of OCU to the WebUI registry, using the shared internal token.

### Modified Capabilities

- `ocu-reverse-proxy`: the browser gateway SHALL NOT forward the internal skill registry path to WebUI.

## Impact

- Backend:
  - `backend/open_webui/routers/ocu_skills.py` (new);
  - `backend/open_webui/models/ocu_skills.py` (new);
  - one migration under `backend/open_webui/migrations/versions/` (down_revision `e6f7a8b9c0d1`);
  - one `include_router` line in `main.py`;
  - a `features` flag already exposed as `enable_ocu_workspace` (`main.py:2311`).
- Frontend:
  - `src/lib/apis/ocu/skills.ts` (new);
  - new Admin Settings and personal Settings tab components;
  - minimal diffs to the settings tab lists and to `Commands/SlashCommands.svelte` / `CommandSuggestionList.svelte`.
- OCU repository: `openwebui/functions/computer_link_filter.py`, `deploy/production-like-test/` compose/bootstrap, `deploy/proxy/nginx.conf.in`, and the pinned OCU SHA in `constraints.yaml`.
- Docs:
  - a decision record under `docs/decisions/`;
  - a glossary term for 上传 skill;
  - an AGENTS.md Critical Paths row and a Verification Matrix row;
  - the user guide.
- Out of scope: OCU extractor hardening (#740).
