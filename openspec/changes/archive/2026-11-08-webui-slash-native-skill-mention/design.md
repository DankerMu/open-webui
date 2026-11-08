## Design

Change surface:

- `src/lib/components/chat/MessageInput.svelte:1424`, one line, the upstream backport;
- `scripts/ocu_stub_model.py` `chat_completion` (`:76-86`) and its test in `backend/open_webui/test/test_ocu_stub_public.py`;
- `e2e/ocu-skills.e2e.ts`, one new case;
- `openspec/changes/ocu-uploaded-skills/tasks.md`, the task 7.1 sentence about native mentions (`:764`).

Must preserve:

- The `/` `command`'s early returns for prompts and for the `compact`/`fork`/`status`/`model`/`settings`/`temporary` ids (`MessageInput.svelte:1408-1416`).
- The uploaded-skill branch (#770) already passes `mentionSuggestionChar: '/'`. It keeps doing so, and `SlashCommands.test.ts` stays unchanged and green.
- The `$` menu (`MessageInput.svelte:1521-1531`) and the channel input are unchanged.
- The stub reply is byte-identical when the system message holds no `<skill name="…">` block. Existing e2e assertions on `Stub reply. Saw: no OCU system prompt.` therefore keep passing.

Must change:

- `attrs: props` becomes `attrs: { ...props, mentionSuggestionChar: '/' }`, as upstream `c402acb404` has it.
- The stub reply appends ` Skills: <name1>, <name2>.` after the existing text when at least one `<skill name="…">` block is present. The names come from the joined system content, captured with `<skill name="([^"]*)">`, in order of appearance, joined with `, ` and ended with `.`. The manifest form (`<skill>\n<id>…</id>\n<name>…</name>`, `middleware.py:2794-2797`) is not a full-content block and adds nothing.

Governing invariant: a native skill picked from the chat `/` menu is sent as `<${id}|{name}>`, so the backend extracts it, injects its full content, and strips the marker.

Seams under test:

- the real browser stack under `make verify-ui-ocu` (Playwright, stub model);
- `scripts/ocu_stub_model.py` `chat_completion(payload)`, loaded through `runpy` as the existing stub tests do.

A component-level test of the `/` `command` would need to mount the whole `MessageInput.svelte`. The browser case is the red-first test instead.

Required evidence (task 1.1):

- **Stub pytest.** Red before, green after.
  - Given a system message containing `<skill name="Harness native skill">\nbody\n</skill>`, the non-streamed reply content is exactly `Stub reply. Saw: no OCU system prompt. Skills: Harness native skill.`
  - With no skill block, the reply is exactly `Stub reply. Saw: no OCU system prompt.` This holds before and after the fix.
  - With only a manifest-form block `<skill>\n<id>x</id>\n<name>X</name>\n<description></description>\n</skill>`, the reply is also exactly that text. This holds before and after, and is red against a pattern that matches `<name>`.
- **Playwright case `slash menu: a native skill is sent as a $ mention and injected`.** Red on `main`, green after. Setup and restore follow the existing slash menu case (`e2e/ocu-skills.e2e.ts:273-352`): the stub provider, `/?models=ocu-stub-model`, and a `finally` that restores the OpenAI config and deletes the chat.
  - Create the native skill through `POST /api/v1/skills/create` with:
    - id `harness-native-skill`;
    - name `Harness native skill`;
    - content `Harness native skill body.`
  - Delete it in `finally` through `DELETE /api/v1/skills/id/harness-native-skill/delete`. Before creating it, delete any leftover one quietly.
  - Select the native skill:
    - Before typing, register `page.waitForRequest` for `/api/v1/skills/list` with `query=harness` in its search params, following `e2e/ocu-skills.e2e.ts:399-403`.
    - Type `/harness` in `#chat-input` and await that request.
    - Locate the row as the `button` containing the text `Harness native skill` inside `#suggestions-container` (`SlashCommands.svelte:430-457`). It is visible and has `data-selected="true"` before Enter.
    - The query also matches the admin's email `admin@harness.local`, so other admin-owned skills can appear. The new one sorts first by `updated_at desc`, and the `data-selected` assertion pins that.
    - Press Enter, type ` 你好`, and send.
  - In the `/api/chat/completions` request body:
    - `user_message.content` contains `<$harness-native-skill|Harness native skill>` and does not contain `<@`;
    - `skill_ids` is `undefined`. The skill can therefore only have been loaded through the mention.
  - The stub reply `Stub reply. Saw: no OCU system prompt. Skills: Harness native skill.` is visible in `#messages-container`. This proves the backend extracted the mention and injected the skill's full content (`middleware.py:2779-2785`).
  - Zero console and page errors (`collectErrors`).
- **Unchanged.**
  - `make test-frontend` passes, including `SlashCommands.test.ts`.
  - The existing four `ocu-skills.e2e.ts` cases pass in `make verify-ui-ocu`.
  - `git diff origin/main -- src/lib/components/chat/MessageInput.svelte` is one changed line.

Verification:

- the stub pytest module;
- `make test-frontend`, `make typecheck`, `make lint-scoped`, `make fmt-check`;
- `make verify-ui-ocu-repeat SPEC=ocu-skills.e2e.ts REPEAT=1`;
- `make verify-ui-ocu`.

Non-goals:

- the mention regexes (#769);
- the OCU filter (#752);
- the `$` menu;
- widening the backend patterns to `<@…>`;
- removing #770's explicit `mentionSuggestionChar` (it stays; the component test pins it).

Review focus:

- the line matches upstream `c402acb404` exactly;
- the stub change cannot alter any existing reply;
- the browser case is red on `main`.
