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

- New Open WebUI table pair (`ocu_skill`, `ocu_skill_user_disable`). The ZIP bytes live in the DB column `ocu_skill.data`, not in `Storage`/`UPLOAD_DIR`, so upload, replace and delete are each one DB transaction. One additive Alembic migration, named in the source plan.
- New router `backend/open_webui/routers/ocu_skills.py`, mounted from the fork-owned `routers/ocu_workspaces.py` by a `router.include_router(ocu_skills.router, prefix='/skills')` call inside its existing `if ENABLE_OCU_WORKSPACE:` block; `main.py` is not changed. With the flag off the router is not mounted, so every route returns 404; `ocu_skills` imports nothing from `ocu_workspaces`. It provides:
  - administrator upload, replace, list, access update and hard delete;
  - a per-user list and a per-user toggle;
  - the two internal endpoints of OCU's existing external skill registry contract (`user-config/{email}`, `skills/{name}/download`), authenticated by `X-Internal-Api-Key` equal to `OCU_INTERNAL_TOKEN`.
- ZIP upload validation:
  - path traversal, symlink and encrypted-entry rejection;
  - limits of 50 MB compressed, 200 MB uncompressed and 2000 entries;
  - `SKILL.md` frontmatter `name` and `description`;
  - a hardcoded reserved list of built-in names (OCU `skills/public/` directory names, `remotion`, and every key of OCU's `NATIVE_PROMPT_DESCRIPTIONS`), with a drift test against the pinned OCU checkout;
  - a body over 50 MB returns 413; every other rejection returns 400.
- A new upload is visible to everyone through a `user:*:read` access grant. Administrators narrow it with the existing access-control UI.
- UI:
  - an Admin Settings tab and a personal Settings tab, both named 「工作区 Skills」;
  - a 「工作区 Skills」 group in the `/` menu that inserts a mention the existing editor serializes as `<$ocu--{name}|{name}>` (no `RichTextInput.svelte` change).
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
  - one `include_router` line inside the existing `if ENABLE_OCU_WORKSPACE:` block of the fork-added `routers/ocu_workspaces.py`; `main.py` is not changed (it is over the 800-line limit);
  - the existing `features.enable_ocu_workspace` flag, already exposed by the unchanged `main.py:2311`;
  - database size grows by the stored ZIPs, at most 50 MB per skill; DB backups carry them, and the admin "reset uploads" / "delete all files" actions do not touch them.
- Frontend:
  - `src/lib/apis/ocu/skills.ts` (new);
  - new Admin Settings and personal Settings tab components;
  - in `chat/SettingsModal.svelte` (1325 lines, over the limit) only tab registration and render branches, under a user-approved `constraints.yaml` `bounded_overrides` entry (ceiling about 1350);
  - minimal diffs to `Commands/SlashCommands.svelte` / `CommandSuggestionList.svelte`;
  - the bare filename `ocu-skills.e2e.ts` added to `REQUIRED_SPECS` in `scripts/verify-ui-ocu.py` (the spec file lives at `e2e/ocu-skills.e2e.ts`).
- OCU repository: `openwebui/functions/computer_link_filter.py`, `deploy/production-like-test/` compose/bootstrap and `scripts/write-deployed-version.sh`, `deploy/proxy/nginx.conf.in`, and the pinned OCU SHA in `constraints.yaml`.
- Harness: `scripts/smoke.sh` sources `scripts/dev-env.sh` and passes the `OCU_INTERNAL_TOKEN` it exports as a hurl secret; CI `layer2-unit-tests` checks out the pinned OCU revision for the drift test.
- Docs:
  - a decision record under `docs/decisions/`;
  - a glossary term for 上传 skill;
  - an AGENTS.md Critical Paths row and a Verification Matrix row;
  - the user guide.
- Out of scope: OCU extractor hardening (#740).
